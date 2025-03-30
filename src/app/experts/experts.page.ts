import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ApiService, ProfileResponse, Session, SessionMessage } from '../services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Peer from 'simple-peer';
import { io, Socket } from 'socket.io-client';

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
  currentSession: { farmerUsername: string; expertUsername: string } | null = null;
  messageContent: string = '';
  requestType: string = 'text';
  requestContent: string = '';
  selectedFile: File | null = null;
  isRecording: boolean = false;
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  localStream: MediaStream | null = null;
  peer: Peer.Instance | null = null;
  private socket!: Socket;
  isSessionEnded: boolean = false;
  incomingCall: { type: 'audio' | 'video'; signal: any; sender: string } | null = null;

  constructor(
    private apiService: ApiService,
    private alertController: AlertController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const userId = localStorage.getItem('user_id');
    if (userId) {
      this.initializeSocket(userId);
    }
    this.loadProfile();
    this.loadPublicRequests();
    this.loadSessions();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  ngOnDestroy() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.closeChat();
  }

  initializeSocket(userId: string) {
    if (!userId) return;

    this.socket = io('http://127.0.0.1:5000/expert', {
      query: { user_id: userId },
      transports: ['websocket'],
      auth: { token: localStorage.getItem('access_token') || '' }
    });

    this.socket.on('connect', () => {
      console.log('Connecté au WebSocket');
    });

    this.socket.on('new_public_request', (data: any) => {
      if (this.userRole === 'expert') {
        this.messages.push(data);
        this.presentAlert('Nouvelle demande', 'Une nouvelle demande publique est disponible.');
        this.cdr.detectChanges();
      }
    });

    this.socket.on('private_session_started', (data: Session) => {
      this.sessions.push(data);
      if (this.userRole === 'farmer') {
        this.presentAlert('Session démarrée', 'Un expert a répondu à votre demande.');
      }
      this.cdr.detectChanges();
    });

    this.socket.on('new_private_message', (data: SessionMessage & { status?: 'sent' | 'received' | 'read' }) => {
      console.log('Nouveau message reçu via WebSocket:', data);
      if (this.currentSession && data.session_id === this.getCurrentSessionId()) {
        this.sessionMessages.push(data);
        this.checkSessionStatus();
        this.scrollToBottom();
        if (data.sender_username !== this.profile?.username) {
          if (data.message_type === 'text' || data.message_type === 'image' || data.message_type === 'video' || data.message_type === 'audio') {
            this.presentNotification('Nouveau message', `${data.sender_username}: ${data.content.substring(0, 20)}...`);
            this.markMessageAsRead(data.id);
          } else if (data.message_type === 'audio_call' || data.message_type === 'video_call') {
            this.incomingCall = { type: data.message_type as 'audio' | 'video', signal: null, sender: data.sender_username };
            this.presentCallNotification(data.message_type, data);
          } else if (data.message_type === 'audio_call_signal' || data.message_type === 'video_call_signal') {
            if (this.incomingCall && this.incomingCall.sender === data.sender_username) {
              this.incomingCall.signal = JSON.parse(data.content);
              this.presentCallNotification(data.message_type.split('_')[0], data);
            }
          }
        }
      }
      this.cdr.detectChanges();
    });

    this.socket.on('session_ended', (data: any) => {
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
    });

    this.socket.on('session_deleted', (data: any) => {
      if (this.currentSession && data.session_id === this.getCurrentSessionId()) {
        this.presentAlert('Session supprimée', data.message);
        this.closeChat();
      }
      this.sessions = this.sessions.filter(s => s.session_id !== data.session_id);
      this.cdr.detectChanges();
    });

    this.socket.on('message_status_update', (data: { message_id: number; status: 'sent' | 'received' | 'read' }) => {
      const message = this.sessionMessages.find(msg => msg.id === data.message_id);
      if (message) {
        message.status = data.status;
        this.cdr.detectChanges();
      }
    });
  }

  joinSessionRoom(sessionId: number) {
    if (this.socket && sessionId) {
      this.socket.emit('join_session', { session_id: sessionId }, (response: any) => {
        console.log('Rejoint la room de session:', sessionId, response);
      });
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
    }
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
        this.messages = data;
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Erreur chargement demandes:', error)
    });
  }

  loadSessions() {
    this.apiService.getUserSessions().subscribe({
      next: (data) => {
        this.sessions = data;
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Erreur chargement sessions:', error)
    });
  }

  sendPublicRequest() {
    const formData = new FormData();
    formData.append('request_type', this.requestType);
    if (this.requestType === 'text') {
      formData.append('content', this.requestContent);
    } else if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    }

    this.apiService.sendPublicRequest(formData).subscribe({
      next: async () => {
        this.requestContent = '';
        this.selectedFile = null;
        this.requestType = 'text';
        await this.presentAlert('Succès', 'Demande envoyée avec succès.');
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’envoi de la demande.');
      }
    });
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    if (this.selectedFile && this.currentSession) {
      this.sendMessage(this.selectedFile.type.startsWith('video') ? 'video' : 
                       this.selectedFile.type.startsWith('image') ? 'image' : 'audio');
    } else if (this.selectedFile) {
      this.requestType = this.selectedFile.type.startsWith('video') ? 'video' : 
                         this.selectedFile.type.startsWith('image') ? 'image' : 'audio';
    }
  }

  handleMessageClick(message: any) {
    if (this.userRole === 'farmer' && message.responded) {
      const session = this.sessions.find(s => s.request_id === message.request_id);
      if (session) this.openSession(session.farmer_username, session.expert_username);
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
        this.openSession(response.farmer_username, response.expert_username);
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la réponse à la demande.');
      }
    });
  }

  openSession(farmerUsername: string, expertUsername: string) {
    this.currentSession = { farmerUsername, expertUsername };
    this.isSessionEnded = false;
    this.incomingCall = null;
    this.apiService.getSessionMessages(farmerUsername, expertUsername).subscribe({
      next: (data) => {
        this.sessionMessages = data.map(msg => ({ ...msg, status: msg.status || 'read' }));
        this.checkSessionStatus();
        const sessionId = this.getCurrentSessionId();
        if (sessionId) {
          this.joinSessionRoom(sessionId); // Rejoindre la room de la session
        }
        this.scrollToBottom();
        this.cdr.detectChanges();
      },
      error: (error) => console.error('Erreur chargement messages:', error)
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
    if (type === 'text') {
      formData.append('content', this.messageContent);
    } else if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    }

    this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
      next: () => {
        this.messageContent = '';
        this.selectedFile = null;
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’envoi du message.');
        if (error.message.includes('terminée')) {
          this.isSessionEnded = true;
          this.cdr.detectChanges();
        }
      }
    });
  }

  markMessageAsRead(messageId: number) {
    if (this.socket && this.currentSession) {
      this.socket.emit('mark_message_read', { message_id: messageId, session_id: this.getCurrentSessionId() }, (response: any) => {
        console.log('Message marqué comme lu:', response);
      });
    }
  }

  async toggleRecording() {
    if (!this.isRecording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) => this.audioChunks.push(event.data);
      this.mediaRecorder.onstop = () => this.saveRecording();
      this.mediaRecorder.start();
      this.isRecording = true;
    } else {
      this.mediaRecorder?.stop();
      this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      this.isRecording = false;
    }
  }

  saveRecording() {
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
    this.selectedFile = new File([audioBlob], `recording_${Date.now()}.wav`, { type: 'audio/wav' });
    this.sendMessage('audio');
  }

  async startCall(type: 'audio' | 'video') {
    if (!this.currentSession || (this.userRole === 'farmer' && this.isSessionEnded)) {
      await this.presentAlert('Erreur', 'Impossible de démarrer un appel : aucune session active ou session terminée.');
      return;
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
    this.peer = new Peer({ initiator: true, trickle: false, stream: this.localStream });

    this.peer.on('signal', (data) => {
      const formData = new FormData();
      formData.append('message_type', `${type}_call_signal`);
      formData.append('content', JSON.stringify(data));
      this.apiService.sendPrivateMessage(this.currentSession!.farmerUsername, this.currentSession!.expertUsername, formData).subscribe({
        next: () => console.log('Signal envoyé'),
        error: (error) => console.error('Erreur envoi signal:', error)
      });
    });

    this.peer.on('stream', (stream) => {
      this.displayCallStream(stream, type, true);
    });

    const formData = new FormData();
    formData.append('message_type', `${type}_call`);
    formData.append('content', `${type === 'video' ? 'Appel vidéo' : 'Appel audio'} initié`);
    this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
      next: async () => {
        await this.presentAlert('Succès', `${type === 'video' ? 'Appel vidéo' : 'Appel audio'} initié avec succès.`);
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’initiation de l’appel.');
      }
    });
  }

  async answerCall() {
    if (!this.incomingCall || !this.currentSession) return;

    this.localStream = await navigator.mediaDevices.getUserMedia({ video: this.incomingCall.type === 'video', audio: true });
    this.peer = new Peer({ initiator: false, trickle: false, stream: this.localStream });

    this.peer.on('signal', (data) => {
      const formData = new FormData();
      formData.append('message_type', `${this.incomingCall!.type}_call_signal`);
      formData.append('content', JSON.stringify(data));
      this.apiService.sendPrivateMessage(this.currentSession!.farmerUsername, this.currentSession!.expertUsername, formData).subscribe({
        next: () => console.log('Signal réponse envoyé'),
        error: (error) => console.error('Erreur envoi signal réponse:', error)
      });
    });

    this.peer.on('stream', (stream) => {
      this.displayCallStream(stream, this.incomingCall!.type, false);
    });

    this.peer.signal(this.incomingCall.signal);
    this.incomingCall = null;
    this.cdr.detectChanges();
  }

  displayCallStream(stream: MediaStream, type: string, isInitiator: boolean) {
    const elementId = `call-${type}-${Date.now()}`;
    const element = document.createElement(type === 'video' ? 'video' : 'audio');
    element.id = elementId;
    element.srcObject = stream;
    element.autoplay = true;
    element.controls = true;
    element.classList.add(`message-${type}`);

    const message: SessionMessage = {
      id: Date.now(),
      session_id: this.getCurrentSessionId()!,
      sender_username: isInitiator ? this.profile?.username || '' : this.incomingCall?.sender || 'Inconnu',
      message_type: type,
      content: elementId,
      created_at: new Date().toISOString(),
      status: 'sent'
    };
    this.sessionMessages.push(message);
    setTimeout(() => {
      const container = this.messagesContainer.nativeElement;
      container.appendChild(element);
      this.scrollToBottom();
      this.cdr.detectChanges();
    }, 100);
  }

  declineCall() {
    this.incomingCall = null;
    this.presentAlert('Appel refusé', 'Vous avez refusé l’appel.');
    this.cdr.detectChanges();
  }

  deleteSession() {
    if (!this.currentSession) return;
    this.apiService.deleteSession(this.currentSession.farmerUsername, this.currentSession.expertUsername).subscribe({
      next: async () => {
        this.closeChat();
        await this.presentAlert('Succès', 'Session supprimée avec succès.');
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la suppression de la session.');
      }
    });
  }

  endSession() {
    if (!this.currentSession) return;
    this.apiService.endSession(this.currentSession.farmerUsername, this.currentSession.expertUsername).subscribe({
      next: async () => {
        await this.presentAlert('Succès', 'Session terminée avec succès.');
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la fin de la session.');
      }
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
      s.expert_username === this.currentSession?.expertUsername
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

  async presentNotification(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [{
        text: 'Ouvrir',
        handler: () => {
          if (this.currentSession) {
            this.openSession(this.currentSession.farmerUsername, this.currentSession.expertUsername);
          }
        }
      }, 'Ignorer']
    });
    await alert.present();
  }

  async presentCallNotification(type: string, data: any) {
    const alert = await this.alertController.create({
      header: `Appel ${type === 'video' ? 'vidéo' : 'audio'} entrant`,
      message: `Appel de ${data.sender_username}`,
      buttons: [
        {
          text: 'Accepter',
          handler: () => this.answerCall()
        },
        {
          text: 'Refuser',
          handler: () => this.declineCall()
        }
      ]
    });
    await alert.present();
  }
}