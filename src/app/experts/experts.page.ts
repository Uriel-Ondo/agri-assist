import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { IonicModule, AlertController, ModalController, AlertButton } from '@ionic/angular';
import { ApiService, ProfileResponse, Session, SessionMessage, PrivateMessageResponse, LiveComment, CallLog } from '../services/api.service';
import { WebsocketService } from '../services/websocket.service'; // Importer WebsocketService
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Peer from 'simple-peer';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-experts',
  templateUrl: './experts.page.html',
  styleUrls: ['./experts.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ExpertsPage implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  userRole: string = '';
  profile: ProfileResponse | null = null;
  messages: any[] = [];
  sessions: Session[] = [];
  sessionMessages: SessionMessage[] = [];
  currentSession: { farmerUsername: string; expertUsername: string; requestId?: number } | null = null;
  messageContent: string = '';
  requestType: string = 'text';
  requestContent: string = '';
  selectedFile: File | null = null;
  isRecording: boolean = false;
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  localStream: MediaStream | null = null;
  peer: Peer.Instance | null = null;
  isSessionEnded: boolean = false;
  incomingCall: { type: 'audio' | 'video'; signal: any; sender: string } | null = null;
  hiddenSessions: Set<number> = new Set();
  activeCallModal: any = null;
  private audioElements: Map<number, HTMLAudioElement> = new Map();
  callLogs: CallLog[] = [];
  private subscriptions: Subscription[] = []; // Pour gérer les abonnements WebSocket

  constructor(
    private apiService: ApiService,
    private websocketService: WebsocketService, // Remplacer Socket par WebsocketService
    private alertController: AlertController,
    private modalController: ModalController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const userId = localStorage.getItem('user_id');
    const token = localStorage.getItem('access_token');
    console.log('ngOnInit experts.page - userId:', userId, 'token:', token);
    if (!userId || userId === 'undefined' || !userId.match(/^\d+$/) || !token) {
      console.error('user_id ou token invalide dans localStorage:', { userId, token });
      this.presentAlert('Erreur', 'Utilisateur non identifié ou session expirée. Veuillez vous reconnecter.');
      this.apiService.logout();
      return;
    }

    this.initializeWebSocketListeners(); // Initialiser les listeners WebSocket
    this.loadProfile();
    this.loadPublicRequests();
    this.loadSessions();

    // Vérifier la connexion WebSocket
    this.subscriptions.push(
      this.websocketService.getConnectionStatus().subscribe(status => {
        console.log('État de la connexion WebSocket:', status);
        if (status && this.sessions.length > 0) {
          this.sessions.forEach(session => this.joinSessionRoom(session.session_id));
        }
      })
    );

    // S'assurer que la connexion WebSocket est établie
    if (!this.websocketService['socket']?.connected) {
      this.websocketService.connect();
    }
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe()); // Désabonner les listeners WebSocket
    this.websocketService.disconnect(); // Utiliser la méthode disconnect du service
    this.closeChat();
    this.closeCallModal();
    this.audioElements.forEach(audio => audio.pause());
    this.audioElements.clear();
  }

  private logFormData(formData: FormData): void {
    const entries: [string, any][] = [];
    formData.forEach((value, key) => entries.push([key, value]));
    console.log('FormData:', entries);
  }

  initializeWebSocketListeners() {
    this.subscriptions.push(
      this.websocketService.getNewPublicRequest().subscribe(data => {
        console.log('Nouvelle demande publique reçue:', data);
        if (this.userRole === 'expert') {
          this.messages.push(data);
          this.presentAlert('Nouvelle demande', 'Une nouvelle demande publique est disponible.');
        } else if (this.userRole === 'farmer' && data.username === this.profile?.username) {
          this.messages.push(data);
        }
        this.cdr.detectChanges();
      })
    );
  
    this.subscriptions.push(
      this.websocketService.getSessionStarted().subscribe((data: Session) => {
        console.log('Session privée démarrée:', data);
        this.sessions.push(data);
        if (this.userRole === 'farmer' && data.farmer_username === this.profile?.username) {
          this.presentAlert('Session démarrée', 'Un expert a répondu à votre demande.');
        }
        this.joinSessionRoom(data.session_id);
        this.cdr.detectChanges();
      })
    );
  
    this.subscriptions.push(
      this.websocketService.getNewMessage().subscribe((data: SessionMessage | LiveComment) => {
        // Vérifier si c'est un SessionMessage
        if ('id' in data && 'session_id' in data) {
          const sessionMessage = data as SessionMessage;
          console.log('Nouveau message privé reçu:', sessionMessage);
          const sessionId = this.getCurrentSessionId();
          const isCurrentSession = this.currentSession && sessionMessage.session_id === sessionId &&
            (sessionMessage.request_id ?? undefined) === this.currentSession.requestId;
  
          if (sessionMessage.message_type === 'audio_call' || sessionMessage.message_type === 'video_call') {
            const callType = sessionMessage.message_type === 'audio_call' ? 'audio' : 'video';
            this.incomingCall = { type: callType, signal: null, sender: sessionMessage.sender_username };
            this.addCallLog(callType, sessionMessage.sender_username, this.profile!.username, 'received');
            if (!isCurrentSession) {
              const session = this.sessions.find(s => s.session_id === sessionMessage.session_id);
              if (session) this.openSession(session.farmer_username, session.expert_username, session.request_id ?? undefined);
            }
            this.presentNotification('Appel entrant', `${sessionMessage.sender_username} vous appelle (${callType})`);
            this.presentCallModal(callType, sessionMessage.sender_username, true);
          } else if (sessionMessage.message_type === 'audio_call_signal' || sessionMessage.message_type === 'video_call_signal') {
            if (this.incomingCall && this.incomingCall.sender === sessionMessage.sender_username) {
              this.incomingCall.signal = JSON.parse(sessionMessage.content);
              const callType = sessionMessage.message_type.startsWith('audio') ? 'audio' : 'video';
              this.presentCallModal(callType, sessionMessage.sender_username, true);
            }
          } else {
            const messageExists = this.sessionMessages.some(m => m.id === sessionMessage.id);
            if (!messageExists) {
              let finalContent = sessionMessage.content;
              if (['image', 'video', 'audio'].includes(sessionMessage.message_type) && finalContent && !finalContent.match(/^https?:\/\//)) {
                finalContent = `http://192.168.1.90:5000${finalContent.startsWith('/') ? '' : '/'}${finalContent}`;
                console.log(`Ajustement URL pour message ${sessionMessage.id}: ${sessionMessage.content} -> ${finalContent}`);
                this.checkMediaUrl(finalContent, (isValid) => {
                  if (!isValid) {
                    console.error(`URL de média invalide: ${finalContent}`);
                    this.presentAlert('Erreur', `Impossible de charger le média: ${finalContent}`);
                  }
                });
              }
              sessionMessage.content = finalContent;
  
              // Ajouter le message à la fin pour ordre croissant
              if (sessionMessage.session_id === sessionId) {
                this.sessionMessages.push(sessionMessage);
                this.checkSessionStatus();
                this.scrollToBottom(true); // Forcer le défilement au bas immédiatement
              }
  
              // Notification pour les messages d'autres utilisateurs
              if (sessionMessage.sender_username !== this.profile?.username) {
                const session = this.sessions.find(s => s.session_id === sessionMessage.session_id);
                if (session) {
                  this.presentNotification(
                    'Nouveau message',
                    `De ${sessionMessage.sender_username} dans ${session.farmer_username} - ${session.expert_username}`,
                    () => {
                      this.openSession(session.farmer_username, session.expert_username, session.request_id ?? undefined);
                      setTimeout(() => this.scrollToBottom(true), 300); // Forcer le défilement après ouverture
                    }
                  );
                  if (isCurrentSession) this.markMessageAsRead(sessionMessage.id);
                }
              }
            }
          }
        } else {
          console.log('Message ignoré (pas un SessionMessage):', data);
        }
        this.cdr.detectChanges();
      })
    );
  
    this.subscriptions.push(
      this.websocketService.getSessionEnded().subscribe((data: any) => {
        console.log('Session terminée reçue:', data);
        if (this.currentSession && data.session_id === this.getCurrentSessionId()) {
          this.isSessionEnded = true;
          this.sessionMessages.push({
            id: Date.now(),
            session_id: this.getCurrentSessionId()!,
            sender_username: 'Système',
            message_type: 'session_ended',
            content: data.message,
            created_at: new Date().toISOString()
          });
          this.scrollToBottom();
          this.presentAlert('Session terminée', data.message);
          this.cdr.detectChanges();
        }
      })
    );
  
    this.subscriptions.push(
      this.websocketService.getMessageStatusUpdate().subscribe((data: { message_id: number; status: string }) => {
        console.log('Mise à jour statut message:', data);
        const message = this.sessionMessages.find(msg => msg.id === data.message_id);
        if (message) {
          message.status = data.status as 'sent' | 'received' | 'read';
          this.cdr.detectChanges();
        }
      })
    );
  
    this.subscriptions.push(
      this.websocketService.getCallStatusUpdate().subscribe((data: { session_id: number; call_id: number; status: string }) => {
        console.log('Mise à jour statut appel:', data);
        const call = this.callLogs.find(c => c.id === data.call_id);
        if (call) {
          call.status = data.status as CallLog['status'];
          this.cdr.detectChanges();
        }
      })
    );
  }

  private checkMediaUrl(url: string, callback: (isValid: boolean) => void) {
    const testElement = url.includes('.mp4') ? document.createElement('video') :
                       url.includes('.wav') || url.includes('.mp3') || url.includes('.webm') ? new Audio() :
                       new Image();
    testElement.onload = () => callback(true);
    testElement.onerror = (e) => {
      console.error(`Erreur de chargement pour ${url}:`, e);
      callback(false);
    };
    testElement.src = url;
  }

  joinSessionRoom(sessionId: number) {
    this.websocketService.joinSession(sessionId); // Utiliser WebsocketService
  }

  scrollToBottom(force: boolean = false) {
    setTimeout(() => {
      if (this.messagesContainer) {
        const container = this.messagesContainer.nativeElement;
        if (force) {
          container.scrollTop = container.scrollHeight; // Forcer au bas
        } else {
          const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 1;
          if (isAtBottom) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }
    }, 100);
  }

  loadProfile() {
    this.apiService.getProfile().subscribe({
      next: (data) => {
        this.profile = data;
        this.userRole = data.role;
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Erreur chargement profil:', error)
    });
  }

  loadPublicRequests() {
    this.apiService.getPublicRequests().subscribe({
      next: (data) => {
        console.log('Demandes publiques chargées:', data);
        this.messages = data;
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Erreur chargement demandes:', error)
    });
  }

  loadSessions() {
    this.apiService.getUserSessions().subscribe({
      next: (data) => {
        console.log('Sessions chargées:', data);
        this.sessions = data;
        if (this.websocketService['socket']?.connected) {
          this.sessions.forEach(session => this.joinSessionRoom(session.session_id));
        }
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Erreur chargement sessions:', error)
    });
  }

  sendPublicRequest() {
    const formData = new FormData();
    formData.append('request_type', this.requestType);
    if (this.requestType === 'text') {
      if (!this.requestContent.trim()) {
        this.presentAlert('Erreur', 'Le contenu du message ne peut pas être vide.');
        return;
      }
      formData.append('content', this.requestContent);
    } else if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    } else {
      this.presentAlert('Erreur', 'Aucun fichier sélectionné.');
      return;
    }

    console.log('Envoi demande publique');
    this.logFormData(formData);
    this.apiService.sendPublicRequest(formData).subscribe({
      next: async (response) => {
        console.log('Demande publique envoyée:', response);
        this.requestContent = '';
        this.selectedFile = null;
        this.requestType = 'text';
        await this.presentAlert('Succès', 'Demande envoyée avec succès.');
        if (this.userRole === 'farmer') {
          this.messages.push({
            request_id: response.request_id,
            username: this.profile?.username,
            request_type: this.requestType,
            content: this.requestType === 'text' ? this.requestContent : this.selectedFile ? URL.createObjectURL(this.selectedFile) : '',
            created_at: new Date().toISOString(),
            responded: false
          });
          this.cdr.detectChanges();
        }
      },
      error: async (error) => await this.presentAlert('Erreur', error.message || 'Erreur lors de l’envoi de la demande.')
    });
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    if (this.selectedFile && this.currentSession) {
      const type = this.selectedFile.type.startsWith('video') ? 'video' :
                   this.selectedFile.type.startsWith('image') ? 'image' : 'audio';
      this.sendMessage(type);
    } else if (this.selectedFile) {
      this.requestType = this.selectedFile.type.startsWith('video') ? 'video' :
                         this.selectedFile.type.startsWith('image') ? 'image' : 'audio';
    }
  }

  handleMessageClick(message: any) {
    if (this.userRole === 'farmer' && message.responded) {
      const session = this.sessions.find(s => s.request_id === message.request_id);
      if (session) this.openSession(session.farmer_username, session.expert_username, session.request_id ?? undefined);
    } else if (this.userRole === 'expert' && !message.responded) {
      this.respondToRequest(message.request_id);
    }
  }

  respondToRequest(requestId: number) {
    const formData = new FormData();
    formData.append('message_type', 'text');
    formData.append('content', 'Conversation démarrée');

    this.apiService.respondToRequest(requestId, formData).subscribe({
      next: (response) => {
        console.log('Réponse à la demande:', response);
        this.openSession(response.farmer_username, response.expert_username, requestId);
      },
      error: async (error) => await this.presentAlert('Erreur', error.message || 'Erreur lors de la réponse à la demande.')
    });
  }

  openSession(farmerUsername: string, expertUsername: string, requestId?: number) {
    console.log('Ouverture session:', { farmerUsername, expertUsername, requestId });
    this.currentSession = { farmerUsername, expertUsername, requestId };
    this.isSessionEnded = false;
    this.incomingCall = null;
    this.sessionMessages = [];
    this.apiService.getSessionMessages(farmerUsername, expertUsername, requestId).subscribe({
      next: (data) => {
        console.log('Messages récupérés pour la session:', data);
        const sessionId = this.getCurrentSessionId();
        if (!sessionId) {
          console.error('ID de session introuvable.');
          this.presentAlert('Erreur', 'Impossible de charger les messages : session introuvable.');
          return;
        }
        this.sessionMessages = data
          .filter(msg => msg.session_id === sessionId)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) // Ordre croissant
          .map(msg => {
            if (['image', 'video', 'audio'].includes(msg.message_type) && msg.content && !msg.content.match(/^https?:\/\//)) {
              const adjustedUrl = `http://192.168.1.90:5000${msg.content.startsWith('/') ? '' : '/'}${msg.content}`;
              console.log(`Ajustement URL pour message ${msg.id}: ${msg.content} -> ${adjustedUrl}`);
              this.checkMediaUrl(adjustedUrl, (isValid) => {
                if (!isValid) console.error(`URL de média invalide: ${adjustedUrl}`);
              });
              return { ...msg, content: adjustedUrl };
            }
            return msg;
          });
        this.checkSessionStatus();
        this.joinSessionRoom(sessionId);
        this.scrollToBottom(true); // Forcer le défilement au bas
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Erreur chargement messages:', error);
        this.presentAlert('Erreur', error.message || 'Impossible de charger les messages de la session.');
      }
    });
  }
  checkSessionStatus() {
    this.isSessionEnded = this.sessionMessages.some(msg => msg.message_type === 'session_ended');
    this.cdr.detectChanges();
  }

  sendMessage(type: string) {
    if (!this.currentSession || (this.userRole === 'farmer' && this.isSessionEnded)) {
      this.presentAlert('Erreur', 'Impossible d’envoyer un message : aucune session active ou session terminée.');
      return;
    }

    const formData = new FormData();
    formData.append('message_type', type);
    let content = '';
    if (type === 'text') {
      if (!this.messageContent.trim()) {
        this.presentAlert('Erreur', 'Le message ne peut pas être vide.');
        return;
      }
      content = this.messageContent;
      formData.append('content', content);
    } else if (this.selectedFile) {
      formData.append('file', this.selectedFile);
      content = URL.createObjectURL(this.selectedFile);
    } else {
      this.presentAlert('Erreur', 'Aucun fichier sélectionné pour ce type de message.');
      return;
    }
    if (this.currentSession.requestId !== undefined) {
      formData.append('request_id', this.currentSession.requestId.toString());
    }

    console.log('Envoi message - type:', type);
    this.logFormData(formData);
    this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
      next: (response: PrivateMessageResponse) => {
        console.log('Message envoyé:', response);
        let finalContent = type === 'text' ? content : response.content || content;
        if (['image', 'video', 'audio'].includes(type)) {
          if (response.content) {
            finalContent = `http://192.168.1.90:5000${response.content.startsWith('/') ? '' : '/'}${response.content}`;
            console.log(`Utilisation de l’URL serveur pour message ${response.message_id}: ${finalContent}`);
            this.checkMediaUrl(finalContent, (isValid) => {
              if (!isValid) {
                console.error(`URL de média invalide: ${finalContent}`);
                this.presentAlert('Erreur', `Impossible de charger le média: ${finalContent}`);
              }
            });
          } else {
            console.warn('Aucun contenu renvoyé par le serveur, utilisation URL temporaire:', content);
          }
        }
        const newMessage: SessionMessage = {
          id: response.message_id,
          session_id: this.getCurrentSessionId()!,
          sender_username: this.profile?.username || '',
          message_type: type,
          content: finalContent,
          created_at: new Date().toISOString(),
          status: 'sent',
          request_id: this.currentSession?.requestId
        };
        this.sessionMessages.push(newMessage);
        this.messageContent = '';
        this.selectedFile = null;
        this.scrollToBottom();
        this.cdr.detectChanges();
      },
      error: async (error) => {
        console.error('Erreur envoi message:', error);
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’envoi du message.');
        if (error.message?.includes('terminée')) {
          this.isSessionEnded = true;
          this.cdr.detectChanges();
        }
      }
    });
  }

  markMessageAsRead(messageId: number) {
    const sessionId = this.getCurrentSessionId();
    if (sessionId) {
      this.websocketService.markMessageAsRead(sessionId, messageId); // Utiliser WebsocketService
    }
  }

  async toggleRecording() {
    if (!this.isRecording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) => this.audioChunks.push(event.data);
      this.mediaRecorder.onstop = () => this.convertAndSaveRecording();
      this.mediaRecorder.start();
      this.isRecording = true;
      console.log('Enregistrement démarré');
      this.cdr.detectChanges();
    } else {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      console.log('Enregistrement arrêté');
    }
  }

  async convertAndSaveRecording() {
    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.selectedFile = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
      this.sendMessage('audio');
    } catch (error) {
      console.error('Erreur conversion audio:', error);
      this.presentAlert('Erreur', 'Échec de l’enregistrement de la note vocale.');
    } finally {
      this.audioChunks = [];
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
      this.cdr.detectChanges();
    }
  }

  toggleAudio(msg: SessionMessage) {
    let audio = this.audioElements.get(msg.id);
    if (!audio) {
      audio = new Audio(msg.content);
      audio.addEventListener('timeupdate', () => this.updateAudioProgress(msg));
      audio.addEventListener('loadedmetadata', () => {
        console.log(`Audio chargé: ${msg.content}, durée: ${audio!.duration}s`);
        this.cdr.detectChanges();
      });
      audio.addEventListener('ended', () => this.cdr.detectChanges());
      audio.addEventListener('error', (e) => {
        console.error(`Erreur de chargement audio: ${msg.content}`, e);
        this.presentAlert('Erreur', `Impossible de charger l’audio: ${msg.content}`);
      });
      this.audioElements.set(msg.id, audio);
    }

    if (audio.paused) {
      audio.play().catch((e) => {
        console.error('Erreur lecture audio:', e);
        this.presentAlert('Erreur', `Impossible de lire l’audio: ${e.message}`);
      });
    } else {
      audio.pause();
    }
    this.cdr.detectChanges();
  }

  isPlaying(msg: SessionMessage): boolean {
    const audio = this.audioElements.get(msg.id);
    return audio ? !audio.paused && !audio.ended : false;
  }

  getProgress(msg: SessionMessage): string {
    const audio = this.audioElements.get(msg.id);
    if (!audio || !audio.duration) return '0%';
    return `${(audio.currentTime / audio.duration) * 100}%`;
  }

  getDuration(msg: SessionMessage): string {
    const audio = this.audioElements.get(msg.id);
    if (!audio || !audio.duration) return '0:00';
    const totalSeconds = Math.floor(audio.duration);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
  }

  seekAudio(event: MouseEvent, msg: SessionMessage) {
    const audio = this.audioElements.get(msg.id);
    if (!audio || !audio.duration) return;

    const progressBar = event.currentTarget as HTMLElement;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newTime = (clickX / rect.width) * audio.duration;
    audio.currentTime = newTime;
    this.cdr.detectChanges();
  }

  updateAudioProgress(msg: SessionMessage) {
    this.cdr.detectChanges();
  }

  addCallLog(type: 'audio' | 'video', caller: string, receiver: string, status: CallLog['status']) {
    const callLog: CallLog = {
      id: Date.now(),
      type,
      caller,
      receiver,
      status,
      timestamp: new Date().toISOString()
    };
    this.callLogs.push(callLog);
    this.cdr.detectChanges();
  }

  updateCallStatus(callId: number, status: CallLog['status']) {
    const call = this.callLogs.find(c => c.id === callId);
    if (call && this.currentSession) {
      call.status = status;
      this.apiService.updateCallStatus(this.currentSession.farmerUsername, this.currentSession.expertUsername, callId, status).subscribe({
        next: () => console.log(`Statut appel ${callId} mis à jour à ${status}`),
        error: (err) => console.error('Erreur mise à jour statut appel:', err)
      });
      this.cdr.detectChanges();
    }
  }

  async startCall(type: 'audio' | 'video') {
    if (!this.currentSession || (this.userRole === 'farmer' && this.isSessionEnded)) {
      await this.presentAlert('Erreur', 'Impossible de démarrer un appel : aucune session active ou session terminée.');
      return;
    }

    const callId = Date.now();
    this.addCallLog(type, this.profile!.username, this.currentSession.expertUsername, 'ongoing');
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
    this.peer = new Peer({ initiator: true, trickle: false, stream: this.localStream });

    this.peer.on('signal', (data) => {
      const formData = new FormData();
      formData.append('message_type', `${type}_call_signal`);
      formData.append('content', JSON.stringify(data));
      if (this.currentSession!.requestId !== undefined) {
        formData.append('request_id', this.currentSession!.requestId.toString());
      }
      this.apiService.sendPrivateMessage(this.currentSession!.farmerUsername, this.currentSession!.expertUsername, formData).subscribe({
        next: () => console.log('Signal envoyé'),
        error: (error) => console.error('Erreur envoi signal:', error)
      });
    });

    this.peer.on('stream', (stream) => {
      this.presentCallModal(type, this.currentSession!.expertUsername, false, stream);
    });

    this.peer.on('error', (err) => {
      console.error('Erreur Peer:', err);
      this.updateCallStatus(callId, 'ended');
      this.endCall();
    });

    const formData = new FormData();
    formData.append('message_type', `${type}_call`);
    formData.append('content', `${type === 'video' ? 'Appel vidéo' : 'Appel audio'} initié`);
    if (this.currentSession!.requestId !== undefined) {
      formData.append('request_id', this.currentSession!.requestId.toString());
    }
    this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
      next: async () => await this.presentCallModal(type, this.currentSession!.expertUsername, false),
      error: async (error) => {
        this.updateCallStatus(callId, 'ended');
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’initiation de l’appel.');
      }
    });
  }

  async answerCall() {
    if (!this.incomingCall || !this.currentSession) return;
  
    const incomingCall = this.incomingCall;
    const callId = this.callLogs.find(c => c.caller === incomingCall.sender && c.status === 'received')?.id;
    if (callId) this.updateCallStatus(callId, 'ongoing');
  
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: incomingCall.type === 'video', audio: true });
    this.peer = new Peer({ initiator: false, trickle: false, stream: this.localStream });
  
    this.peer.on('signal', (data) => {
      const formData = new FormData();
      formData.append('message_type', `${incomingCall.type}_call_signal`);
      formData.append('content', JSON.stringify(data));
      if (this.currentSession!.requestId !== undefined) {
        formData.append('request_id', this.currentSession!.requestId.toString());
      }
      this.apiService.sendPrivateMessage(this.currentSession!.farmerUsername, this.currentSession!.expertUsername, formData).subscribe({
        next: () => console.log('Signal réponse envoyé'),
        error: (error) => console.error('Erreur envoi signal réponse:', error)
      });
    });
  
    this.peer.on('stream', (stream) => {
      // Mettre à jour le modal avec le flux distant
      this.presentCallModal(incomingCall.type, incomingCall.sender, false, stream);
    });
  
    this.peer.on('error', (err) => {
      console.error('Erreur Peer:', err);
      if (callId) this.updateCallStatus(callId, 'ended');
      this.endCall();
    });
  
    // Signaler immédiatement pour établir la connexion
    this.peer.signal(incomingCall.signal);
  
    // Afficher immédiatement le modal avec le flux local
    this.presentCallModal(incomingCall.type, incomingCall.sender, false);
    this.incomingCall = null;
    this.cdr.detectChanges();
  }

  declineCall() {
    if (this.incomingCall) {
      const callId = this.callLogs.find(c => c.caller === this.incomingCall!.sender && c.status === 'received')?.id;
      if (callId) this.updateCallStatus(callId, 'missed');
    }
    this.incomingCall = null;
    this.closeCallModal();
    this.presentAlert('Appel refusé', 'Vous avez refusé l’appel.');
    this.cdr.detectChanges();
  }

  async showImageModal(imageUrl: string) {
    this.checkMediaUrl(imageUrl, async (isValid) => {
      if (!isValid) {
        this.presentAlert('Erreur', `Image invalide ou inaccessible: ${imageUrl}`);
        return;
      }
      const modal = await this.modalController.create({
        component: ImageModalComponent,
        componentProps: { imageUrl },
        cssClass: 'image-modal'
      });
      await modal.present();
    });
  }

  async presentCallModal(type: 'audio' | 'video', caller: string, isIncoming: boolean, remoteStream?: MediaStream) {
    if (this.activeCallModal) return;

    const modal = await this.modalController.create({
      component: CallModalComponent,
      componentProps: {
        callType: type,
        caller,
        isIncoming,
        localStream: this.localStream,
        remoteStream,
        onAccept: () => this.answerCall(),
        onDecline: () => this.declineCall(),
        onEnd: () => this.endCall()
      },
      cssClass: 'call-modal',
      backdropDismiss: false
    });

    this.activeCallModal = modal;
    await modal.present();
    modal.onDidDismiss().then(() => {
      this.activeCallModal = null;
      this.cdr.detectChanges();
    });
  }

  endCall() {
    const ongoingCall = this.callLogs.find(c => c.status === 'ongoing');
    if (ongoingCall) this.updateCallStatus(ongoingCall.id, 'ended');
    this.peer?.destroy();
    this.peer = null;
    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;
    this.closeCallModal();
    
    // Restaurer la vue de la discussion si une session est active
    if (this.currentSession) {
      this.scrollToBottom(true); // Forcer le défilement au bas
    }
    this.cdr.detectChanges();
  }

  closeCallModal() {
    if (this.activeCallModal) {
      this.activeCallModal.dismiss();
      this.activeCallModal = null;
    }
  }

  hideSession() {
    if (!this.currentSession) return;
    const sessionId = this.getCurrentSessionId();
    if (sessionId) {
      this.hiddenSessions.add(sessionId);
      this.closeChat();
      this.presentAlert('Succès', 'Conversation masquée.');
      this.cdr.detectChanges();
    }
  }

  showHiddenSessions() {
    this.presentHiddenSessionsAlert();
  }

  endSession() {
    if (!this.currentSession) return;
    this.apiService.endSession(this.currentSession.farmerUsername, this.currentSession.expertUsername).subscribe({
      next: async () => await this.presentAlert('Succès', 'Session terminée avec succès.'),
      error: async (error) => await this.presentAlert('Erreur', error.message || 'Erreur lors de la fin de la session.')
    });
  }

  closeChat() {
    this.currentSession = null;
    this.sessionMessages = [];
    this.isSessionEnded = false;
    this.incomingCall = null;
    this.peer?.destroy();
    this.peer = null;
    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;
    this.cdr.detectChanges();
  }

  private getCurrentSessionId(): number | undefined {
    const session = this.sessions.find(s =>
      s.farmer_username === this.currentSession?.farmerUsername &&
      s.expert_username === this.currentSession?.expertUsername &&
      (!this.currentSession?.requestId || s.request_id === this.currentSession.requestId)
    );
    return session?.session_id;
  }

  async presentAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  async presentNotification(header: string, message: string, onOpen?: () => void) {
    const buttons: AlertButton[] = [
      {
        text: 'Ouvrir',
        handler: () => {
          if (onOpen) {
            onOpen();
            // Forcer le défilement après ouverture
            setTimeout(() => this.scrollToBottom(true), 300); // Délai pour attendre le rendu
          } else if (this.currentSession) {
            this.openSession(this.currentSession.farmerUsername, this.currentSession.expertUsername, this.currentSession.requestId);
            setTimeout(() => this.scrollToBottom(true), 300);
          }
          return true;
        }
      },
      { text: 'Ignorer', role: 'cancel' }
    ];
  
    const alert = await this.alertController.create({
      header,
      message,
      buttons
    });
    await alert.present();
  }

  async presentHiddenSessionsAlert() {
    const hiddenSessions = this.sessions.filter(s => this.hiddenSessions.has(s.session_id));
    const inputs = hiddenSessions.map(session => ({
      name: `${session.session_id}`,
      type: 'radio' as const,
      label: `${session.farmer_username} - ${session.expert_username} (Demande #${session.request_id ?? 'N/A'})`,
      value: session
    }));

    const alert = await this.alertController.create({
      header: 'Conversations masquées',
      inputs,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Afficher',
          handler: (selectedSession: Session) => {
            if (selectedSession) {
              this.hiddenSessions.delete(selectedSession.session_id);
              this.openSession(selectedSession.farmer_username, selectedSession.expert_username, selectedSession.request_id ?? undefined);
            }
          }
        }
      ]
    });
    await alert.present();
  }
}

// Les composants ImageModalComponent et CallModalComponent restent inchangés
@Component({
  selector: 'app-image-modal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()">
            <ion-icon name="arrow-back"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Image</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding" [inert]="!isModalOpen">
      <ion-img [src]="imageUrl" (click)="dismiss()"></ion-img>
    </ion-content>
  `,
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ImageModalComponent {
  imageUrl!: string;
  isModalOpen: boolean = true;

  constructor(private modalController: ModalController) {}

  dismiss() {
    this.isModalOpen = false;
    this.modalController.dismiss();
  }
}

@Component({
  selector: 'app-call-modal',
  template: `
    <ion-content class="call-modal-content" [inert]="!isModalOpen">
      <div class="call-header">
        <ion-avatar>
          <img src="/assets/default-avatar.png" alt="Caller">
        </ion-avatar>
        <h2>{{ caller }}</h2>
        <p>{{ callType === 'video' ? 'Appel vidéo' : 'Appel audio' }} {{ isIncoming ? 'entrant' : 'en cours' }}</p>
      </div>
      <div class="call-streams" *ngIf="!isIncoming || remoteStream">
        <video *ngIf="callType === 'video'" #localVideo autoplay muted class="local-video"></video>
        <video *ngIf="callType === 'video' && remoteStream" #remoteVideo autoplay class="remote-video"></video>
        <audio *ngIf="callType === 'audio' && remoteStream" #remoteAudio autoplay></audio>
      </div>
      <ion-buttons class="call-actions">
        <ion-button *ngIf="isIncoming" color="success" (click)="onAccept()">
          <ion-icon name="call"></ion-icon> Accepter
        </ion-button>
        <ion-button *ngIf="isIncoming" color="danger" (click)="handleDecline()">
          <ion-icon name="call-outline"></ion-icon> Refuser
        </ion-button>
        <ion-button *ngIf="!isIncoming" color="danger" (click)="handleEnd()">
          <ion-icon name="call-end"></ion-icon> Raccrocher
        </ion-button>
      </ion-buttons>
    </ion-content>
  `,
  styles: [`
    .call-modal-content {
      --background: #f5f5f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      height: 100%;
      padding: 20px;
    }
    .call-header {
      text-align: center;
      margin-top: 20px;
    }
    .call-header ion-avatar {
      width: 80px;
      height: 80px;
      margin: 0 auto 10px;
    }
    .call-header h2 {
      font-size: 1.5rem;
      color: #333;
    }
    .call-header p {
      font-size: 1rem;
      color: #666;
    }
    .call-streams {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .local-video {
      width: 120px;
      height: 160px;
      position: absolute;
      bottom: 20px;
      right: 20px;
      border-radius: 10px;
      border: 2px solid #fff;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    .remote-video {
      width: 100%;
      max-height: 70vh;
      border-radius: 10px;
    }
    .call-actions {
      margin-bottom: 20px;
    }
    .call-actions ion-button {
      --border-radius: 50%;
      width: 60px;
      height: 60px;
      margin: 0 10px;
    }
  `],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class CallModalComponent {
  @ViewChild('localVideo') localVideo!: ElementRef;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef;
  @ViewChild('remoteAudio') remoteAudio!: ElementRef;

  callType!: 'audio' | 'video';
  caller!: string;
  isIncoming!: boolean;
  localStream!: MediaStream | null;
  remoteStream!: MediaStream | null;
  onAccept!: () => void;
  onDecline!: () => void;
  onEnd!: () => void;
  isModalOpen: boolean = true;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit() {
    if (this.localStream && this.localVideo) {
      this.localVideo.nativeElement.srcObject = this.localStream;
    }
    if (this.remoteStream) {
      if (this.callType === 'video' && this.remoteVideo) {
        this.remoteVideo.nativeElement.srcObject = this.remoteStream;
      } else if (this.callType === 'audio' && this.remoteAudio) {
        this.remoteAudio.nativeElement.srcObject = this.remoteStream;
      }
    }
    this.cdr.detectChanges();
  }

  handleDecline() {
    this.isModalOpen = false;
    this.onDecline();
  }

  handleEnd() {
    this.isModalOpen = false;
    this.onEnd();
  }
}