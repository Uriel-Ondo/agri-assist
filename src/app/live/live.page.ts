import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import Hls from 'hls.js';
import flvjs from 'flv.js';
import { ApiService, LiveComment, ProfileResponse, LiveSession, SessionMessage } from '../services/api.service';
import { WebsocketService } from '../services/websocket.service';
import { Subscription } from 'rxjs';
import { NgZone } from '@angular/core';

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
  @ViewChild('commentsList', { static: false }) commentsList!: ElementRef;
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
  liveSessions: LiveSession[] = []; // Sessions live en cours (tous les utilisateurs)
  expertLiveSessions: LiveSession[] = []; // Sessions live de l'expert connecté
  isLoading = false;
  videoError = false;
  private hls: Hls | null = null;
  private flvPlayer: any = null;
  username: string = 'Vous'; // Rendu public (suppression de "private")
  private subscriptions: Subscription[] = [];
  isExpert: boolean = localStorage.getItem('role') === 'expert';

  constructor(
    private apiService: ApiService,
    private websocketService: WebsocketService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.websocketService.connect('live');
    this.loadUserProfile();
    this.loadInitialComments();
    this.loadLiveSessions();
    if (this.isExpert) {
      this.loadExpertLiveSessions();
    }
    this.setupWebSocketListeners();
  }

  ngAfterViewInit() {
    const hlsVideo = document.getElementById('hls-video') as HTMLVideoElement;
    this.fallbackToHls(hlsVideo);
    this.scrollToBottom();
  }

  ngOnDestroy() {
    if (this.hls) {
      this.hls.destroy();
    }
    if (this.flvPlayer) {
      this.flvPlayer.destroy();
    }
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.websocketService.disconnect();
  }

  loadUserProfile() {
    const sub = this.apiService.getProfile().subscribe({
      next: (profile: ProfileResponse) => {
        this.username = profile.username || 'Vous';
        console.log('Nom d’utilisateur chargé:', this.username);
      },
      error: (error) => {
        console.error('Erreur lors du chargement du profil:', error);
        this.username = 'Vous';
      }
    });
    this.subscriptions.push(sub);
  }

  loadInitialComments() {
    const sub = this.apiService.getLiveComments().subscribe({
      next: (comments) => {
        this.comments = comments;
        console.log('Commentaires initiaux chargés:', comments);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Erreur lors du chargement des commentaires initiaux:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  loadLiveSessions() {
    const sub = this.apiService.getLiveSessions().subscribe({
      next: (sessions) => {
        this.liveSessions = sessions.filter(s => s.status === 'active');
        console.log('Sessions live chargées:', this.liveSessions);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Erreur lors du chargement des sessions live:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  loadExpertLiveSessions() {
    const sub = this.apiService.getExpertLiveSessions().subscribe({
      next: (sessions) => {
        this.expertLiveSessions = sessions;
        console.log('Sessions live de l’expert chargées:', this.expertLiveSessions);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Erreur lors du chargement des sessions live de l’expert:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  setupWebSocketListeners() {
    const messageSub = this.websocketService.getNewMessage().subscribe((data: SessionMessage | LiveComment) => {
      this.zone.run(() => {
        console.log('Nouveau message reçu via WebSocket:', data);
        if ('comment' in data && 'username' in data && 'created_at' in data) {
          const liveComment = data as LiveComment;
          const commentExists = this.comments.some(
            c => c.comment === liveComment.comment && c.created_at === liveComment.created_at && c.username === liveComment.username
          );
          if (!commentExists) {
            this.comments.push(liveComment);
            this.cdr.detectChanges();
            this.scrollToBottom();
            console.log('Nouveau commentaire ajouté:', liveComment);
          }
        }
      });
    });
    this.subscriptions.push(messageSub);

    const liveStartedSub = this.websocketService.getLiveStarted().subscribe((data: LiveSession) => {
      this.zone.run(() => {
        console.log('Nouvelle session live démarrée:', data);
        this.liveSessions.unshift(data);
        if (this.isExpert && data.expert_username === this.username) {
          this.expertLiveSessions.unshift(data);
        }
        this.cdr.detectChanges();
      });
    });
    this.subscriptions.push(liveStartedSub);

    const liveEndedSub = this.websocketService.getLiveEnded().subscribe((data: any) => {
      this.zone.run(() => {
        console.log('Session live terminée:', data);
        const session = this.liveSessions.find(s => s.session_id === data.session_id);
        if (session) {
          session.status = 'ended';
          session.ended_at = new Date().toISOString();
          this.liveSessions = this.liveSessions.filter(s => s.status === 'active');
          this.cdr.detectChanges();
        }
        const expertSession = this.expertLiveSessions.find(s => s.session_id === data.session_id);
        if (expertSession) {
          expertSession.status = 'ended';
          expertSession.ended_at = new Date().toISOString();
          this.cdr.detectChanges();
        }
      });
    });
    this.subscriptions.push(liveEndedSub);

    const statusSub = this.websocketService.getConnectionStatus().subscribe((status) => {
      console.log('État de la connexion WebSocket /live:', status ? 'Connecté' : 'Déconnecté');
    });
    this.subscriptions.push(statusSub);
  }

  sendComment() {
    if (this.newComment.trim()) {
      console.log('Envoi du commentaire via API:', this.newComment);
      const sub = this.apiService.postLiveComment(this.newComment).subscribe({
        next: (response) => {
          console.log('Réponse API:', response);
          this.newComment = '';
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Erreur lors de l’envoi du commentaire:', error.message);
        }
      });
      this.subscriptions.push(sub);
    } else {
      console.warn('Commentaire vide, rien n’est envoyé');
    }
  }

  async fallbackToHls(video: HTMLVideoElement) {
    this.isLoading = true;
    this.videoError = false;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.flvPlayer) {
      this.flvPlayer.destroy();
      this.flvPlayer = null;
    }

    const hlsUrl = await this.fetchHlsUrl(this.selectedChannel);
    if (!hlsUrl) {
      console.error('Impossible de récupérer l’URL HLS');
      this.isLoading = false;
      this.videoError = true;
      this.cdr.detectChanges();
      return;
    }

    console.log('URL HLS récupérée:', hlsUrl);

    if (hlsUrl.endsWith('.mp4')) {
      video.src = hlsUrl;
      video.load();
      video.onloadeddata = () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur de lecture MP4:', err));
        this.cdr.detectChanges();
      };
      video.onerror = () => {
        this.isLoading = false;
        this.videoError = true;
        this.cdr.detectChanges();
      };
    } else if (Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(hlsUrl);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur de lecture HLS:', err));
        this.cdr.detectChanges();
      });
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('Erreur HLS:', data);
        this.isLoading = false;
        this.videoError = true;
        this.cdr.detectChanges();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
      video.load();
      video.onloadeddata = () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur de lecture native:', err));
        this.cdr.detectChanges();
      };
      video.onerror = () => {
        this.isLoading = false;
        this.videoError = true;
        this.cdr.detectChanges();
      };
    } else {
      console.error('HLS non supporté sur cet appareil');
      this.isLoading = false;
      this.videoError = true;
      this.cdr.detectChanges();
    }

    video.style.display = 'block';
  }

  async fetchHlsUrl(channel: string): Promise<string> {
    try {
      const headers = this.apiService['getHeaders']();
      const headersObj: Record<string, string> = {};
      headers.keys().forEach(key => {
        const value = headers.get(key);
        if (value) {
          headersObj[key] = value;
        }
      });

      const response = await fetch(`http://192.168.1.90:5000/live/stream/${channel}`, {
        headers: headersObj
      });
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

  startLive() {
    if (!this.isExpert) {
      console.error('Seuls les experts peuvent démarrer un live');
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      const streamType = 'hls'; // Par défaut, peut être modifié selon la logique serveur
      const streamUrl = 'http://192.168.1.90:5000/live/stream/hls_sample.m3u8'; // À remplacer par une URL dynamique
      this.websocketService.startLive(streamUrl, streamType, `Live - ${this.username}`);
    }).catch((err: unknown) => {
      console.error('Erreur accès caméra/micro:', err);
    });
  }

  playLive(session: LiveSession) {
    const video = document.getElementById('hls-video') as HTMLVideoElement;
    this.isLoading = true;
    this.videoError = false;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.flvPlayer) {
      this.flvPlayer.destroy();
      this.flvPlayer = null;
    }

    if (session.stream_type === 'hls' && Hls.isSupported()) {
      this.hls = new Hls();
      this.hls.loadSource(session.stream_url);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur lecture HLS:', err));
        this.cdr.detectChanges();
      });
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('Erreur HLS:', data);
        this.isLoading = false;
        this.videoError = true;
        this.cdr.detectChanges();
      });
    } else if (session.stream_type === 'srs' && flvjs.isSupported()) {
      this.flvPlayer = flvjs.createPlayer({
        type: 'flv',
        url: session.stream_url
      });
      this.flvPlayer.attachMediaElement(video);
      this.flvPlayer.load();
      this.flvPlayer.play().then(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }).catch((err: unknown) => {
        console.error('Erreur lecture SRS:', err);
        this.isLoading = false;
        this.videoError = true;
        this.cdr.detectChanges();
      });
    } else {
      video.src = session.stream_url;
      video.load();
      video.onloadeddata = () => {
        this.isLoading = false;
        video.play().catch(err => console.error('Erreur lecture:', err));
        this.cdr.detectChanges();
      };
      video.onerror = () => {
        this.isLoading = false;
        this.videoError = true;
        this.cdr.detectChanges();
      };
    }
  }

  endLive(sessionId: number) {
    if (!this.isExpert) {
      console.error('Seuls les experts peuvent arrêter un live');
      return;
    }
    this.websocketService.endLive(sessionId);
  }

  deleteLive(sessionId: number) {
    if (!this.isExpert) {
      console.error('Seuls les experts peuvent supprimer un live');
      return;
    }
    const sub = this.apiService.deleteLiveSession(sessionId).subscribe({
      next: (response) => {
        console.log('Live supprimé:', response);
        this.expertLiveSessions = this.expertLiveSessions.filter(s => s.session_id !== sessionId);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Erreur lors de la suppression du live:', error);
      }
    });
    this.subscriptions.push(sub);
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.commentsList?.nativeElement) {
        const commentsList = this.commentsList.nativeElement;
        commentsList.scrollTop = commentsList.scrollHeight;
        console.log('Scroll effectué, hauteur:', commentsList.scrollHeight);
      } else {
        console.warn('Liste des commentaires non trouvée - DOM pas encore prêt');
      }
    }, 100);
  }
}