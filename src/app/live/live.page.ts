import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';
import Hls from 'hls.js';
import { ApiService, LiveComment } from '../services/api.service';

interface Channel {
  value: string;
  name: string;
  color?: string;
}

@Component({
  selector: 'app-live',
  templateUrl: './live.page.html',
  styleUrls: ['./live.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule]
})
export class LivePage implements OnInit, AfterViewInit, OnDestroy {
  socket!: Socket;
  comments: LiveComment[] = [];
  newComment = '';
  selectedChannel = 'tv5monde';
  channels: Channel[] = [
    { value: 'info6', name: 'INFO6', color: '#e91e63' },
    { value: 'france24', name: 'France24', color: '#2196f3' },
    { value: 'tv5monde', name: 'TV5MONDE', color: '#e91e63' },
    { value: 'animesama', name: 'AnimeSama', color: '#2196f3' },
    { value: 'tvanime', name: 'TVAnime', color: '#4CAF50' }
  ];
  isLoading = false;
  videoError = false;
  private hls: Hls | null = null;

  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const token = localStorage.getItem('access_token');
    console.log('Token utilisé pour Socket.IO:', token);
    this.socket = io('http://localhost:5000/live', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10, // Augmenté pour plus de tentatives
      reconnectionDelay: 1000
    });
    this.setupSocket();
  }

  ngAfterViewInit() {
    const hlsVideo = document.getElementById('hls-video') as HTMLVideoElement;
    this.loadInitialComments();
    this.fallbackToHls(hlsVideo);
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

    console.log('URL HLS récupérée:', hlsUrl);

    if (hlsUrl.endsWith('.mp4')) {
      video.src = hlsUrl;
      video.load();
      video.onloadeddata = () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur de lecture MP4:', err));
      };
      video.onerror = () => {
        this.isLoading = false;
        this.videoError = true;
      };
    } else if (Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(hlsUrl);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur de lecture HLS:', err));
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
        video.play().catch(err => console.error('Erreur de lecture native:', err));
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
    console.log('Changement de chaîne vers:', this.selectedChannel);
    const hlsVideo = document.getElementById('hls-video') as HTMLVideoElement;
    this.fallbackToHls(hlsVideo);
  }

  loadInitialComments() {
    this.apiService.getLiveComments().subscribe({
      next: (comments) => {
        this.comments = comments;
        this.scrollToBottom();
        console.log('Commentaires initiaux chargés:', comments);
      },
      error: (error) => {
        console.error('Erreur lors du chargement des commentaires initiaux:', error);
      }
    });
  }

  sendComment() {
    if (this.newComment.trim()) {
      console.log('Envoi du commentaire via API:', this.newComment);
      this.apiService.postLiveComment(this.newComment).subscribe({
        next: (response) => {
          console.log('Réponse API:', response);
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
    });

    this.socket.on('new_comment', (data: LiveComment) => {
      console.log('Nouveau commentaire reçu via Socket.IO:', data);
      this.comments.push(data);
      this.cdr.detectChanges(); // Forcer la mise à jour de l’UI
      this.scrollToBottom();
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('Erreur de connexion Socket.IO:', error);
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('Déconnecté du namespace /live:', reason);
    });

    this.socket.on('message', (data: any) => {
      console.log('Message brut reçu via Socket.IO:', data);
    });

    // Vérifier si le socket est connecté après initialisation
    if (this.socket.connected) {
      console.log('Socket déjà connecté lors de l’initialisation');
    } else {
      console.log('Socket en attente de connexion');
    }
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