import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { io } from 'socket.io-client';
import Hls from 'hls.js';
import { ApiService } from '../services/api.service';

interface LiveComment {
  username: string;
  comment: string;
  created_at: string;
}

@Component({
  selector: 'app-live',
  templateUrl: './live.page.html',
  styleUrls: ['./live.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule]
})
export class LivePage implements AfterViewInit, OnDestroy {
  socket: any;
  comments: LiveComment[] = [];
  newComment = '';
  selectedChannel = 'EURONEWS';
  isLoading = false;
  videoError = false;
  private hls: Hls | null = null;

  constructor(private apiService: ApiService) {
    this.socket = io('http://localhost:5000/live', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });
  }

  ngAfterViewInit() {
    this.initializeHbbTV();
    this.setupSocket();
    this.loadInitialComments();
  }

  initializeHbbTV() {
    const broadcastVideo = document.getElementById('broadcast-video') as HTMLObjectElement;
    const hlsVideo = document.getElementById('hls-video') as HTMLVideoElement;

    const isHbbTVSupported = this.checkHbbTVSupport();
    if (isHbbTVSupported) {
      try {
        const appManager = document.createElement('object');
        appManager.setAttribute('type', 'application/oipfApplicationManager');
        appManager.style.display = 'none';
        document.body.appendChild(appManager);

        const app = (appManager as any).getOwnerApplication(document);
        if (app) {
          app.show();
          app.activate();
          (app.privateData as any).keyset.setValue(0x1f);
        }

        (broadcastVideo as any).bindToCurrentChannel();
        broadcastVideo.style.display = 'block';
        hlsVideo.style.display = 'none';
        this.isLoading = false;
      } catch (error) {
        console.error('Erreur lors de l’initialisation HbbTV:', error);
        this.fallbackToHls(hlsVideo);
      }
    } else {
      console.warn('HbbTV non supporté, passage au flux HLS');
      this.fallbackToHls(hlsVideo);
    }
  }

  checkHbbTVSupport(): boolean {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('hbbtv') || (window as any).HbbTV !== undefined;
  }

  async fallbackToHls(video: HTMLVideoElement) {
    this.isLoading = true;
    this.videoError = false;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    const hlsUrl = await this.fetchHlsUrl(this.selectedChannel);
    if (!hlsUrl) {
      console.error('Impossible de récupérer l’URL HLS');
      this.isLoading = false;
      this.videoError = true;
      return;
    }

    if (Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(hlsUrl);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.isLoading = false;
        video.play();
      });
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('Erreur HLS:', data);
        this.isLoading = false;
        this.videoError = true;
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.load();
      video.onloadeddata = () => {
        this.isLoading = false;
        video.play();
      };
      video.onerror = () => {
        this.isLoading = false;
        this.videoError = true;
      };
    } else {
      console.error('HLS non supporté sur cet appareil');
      this.isLoading = false;
      this.videoError = true;
    }

    video.style.display = 'block';
    (document.getElementById('broadcast-video') as HTMLObjectElement).style.display = 'none';
  }

  async fetchHlsUrl(channel: string): Promise<string> {
    try {
      const response = await fetch(`http://localhost:5000/live/stream/${channel}`);
      const data = await response.json();
      return data.stream_url || '';
    } catch (error) {
      console.error('Erreur lors de la récupération de l’URL HLS:', error);
      return '';
    }
  }

  changeChannel() {
    const hlsVideo = document.getElementById('hls-video') as HTMLVideoElement;
    this.fallbackToHls(hlsVideo);
  }

  async loadInitialComments() {
    try {
      const response = await fetch('http://localhost:5000/live/comments');
      const data = await response.json();
      this.comments = data;
      this.scrollToBottom();
    } catch (error) {
      console.error('Erreur lors du chargement des commentaires initiaux:', error);
    }
  }
  sendComment() {
    if (this.newComment.trim()) {
      console.log('Envoi du commentaire via API:', this.newComment);
      this.apiService.postLiveComment(this.newComment).subscribe({
        next: (response) => {
          console.log('Réponse API:', response);
          // Le commentaire sera reçu via Socket.IO si le backend émet
          this.newComment = '';
          this.scrollToBottom();
        },
        error: (error) => {
          console.error('Erreur API:', error.message);
        }
      });
    } else {
      console.warn('Commentaire vide, rien n’est envoyé');
    }
  }

  setupSocket() {
    this.socket.on('connect', () => {
      console.log('Connecté au namespace /live');
      // Test d'émission manuelle pour vérifier
      this.socket.emit('test_event', { message: 'Test de connexion' });
    });
  
    this.socket.on('new_comment', (data: LiveComment) => {
      console.log('Nouveau commentaire reçu via Socket.IO:', data);
      this.comments.push(data);
      this.scrollToBottom();
    });
  
    this.socket.on('connect_error', (error: any) => {
      console.error('Erreur de connexion Socket.IO:', error);
    });
  
    this.socket.on('disconnect', () => {
      console.log('Déconnecté du namespace /live');
    });
  
    // Ajouter un écouteur pour le test
    this.socket.on('test_event', (data: any) => {
      console.log('Événement de test reçu:', data);
    });
  }

  scrollToBottom() {
    setTimeout(() => {
      const commentsList = document.querySelector('.comments-list');
      if (commentsList) {
        commentsList.scrollTop = commentsList.scrollHeight;
        console.log('Scroll effectué, hauteur:', commentsList.scrollHeight);
      } else {
        console.warn('Liste des commentaires non trouvée');
      }
    }, 100);
  }
  ngOnDestroy() {
    if (this.hls) {
      this.hls.destroy();
    }
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}