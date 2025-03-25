import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ApiService, ProfileResponse, Session, SessionMessage } from '../services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Peer from 'simple-peer';

@Component({
  selector: 'app-experts',
  templateUrl: './experts.page.html',
  styleUrls: ['./experts.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ExpertsPage implements OnInit, AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  userRole: string = '';
  profile: ProfileResponse | null = null;
  messages: any[] = []; // Liste des demandes publiques
  sessions: Session[] = []; // Liste des sessions
  sessionMessages: SessionMessage[] = []; // Messages de la session actuelle
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

  constructor(
    private apiService: ApiService,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.loadProfile();
    this.loadPublicRequests();
    this.loadSessions();
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
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
      },
      error: (error) => console.error('Erreur lors de la récupération du profil:', error)
    });
  }

  loadPublicRequests() {
    this.apiService.getPublicRequests().subscribe({
      next: (data) => {
        this.messages = data;
      },
      error: (error) => console.error('Erreur lors de la récupération des demandes:', error)
    });
  }

  loadSessions() {
    this.apiService.getUserSessions().subscribe({
      next: (data) => {
        this.sessions = data;
      },
      error: (error) => console.error('Erreur lors de la récupération des sessions:', error)
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
        this.loadPublicRequests();
        this.loadSessions();
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
    if (this.selectedFile) {
      this.requestType = this.selectedFile.type.startsWith('video') ? 'video' :
                         this.selectedFile.type.startsWith('image') ? 'image' : 'audio';
      this.sendMessage(this.requestType);
    } else {
      this.requestType = 'text';
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
        this.loadPublicRequests();
        this.loadSessions();
        this.openSession(response.farmer_username, response.expert_username);
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la réponse à la demande.');
      }
    });
  }

  openSession(farmerUsername: string, expertUsername: string) {
    this.currentSession = { farmerUsername, expertUsername };
    this.refreshMessages();
  }

  refreshMessages() {
    if (!this.currentSession) return;
    this.apiService.getSessionMessages(this.currentSession.farmerUsername, this.currentSession.expertUsername).subscribe({
      next: (data) => {
        this.sessionMessages = data;
      },
      error: (error) => console.error('Erreur lors de la récupération des messages:', error)
    });
  }

  sendMessage(type: string) {
    if (!this.currentSession) {
      console.error('Aucune session sélectionnée');
      return;
    }
  
    console.log('Envoi message:', { type, farmer: this.currentSession.farmerUsername, expert: this.currentSession.expertUsername });
  
    const formData = new FormData();
    formData.append('message_type', type);
    if (type === 'text') {
      formData.append('content', this.messageContent);
    } else if (this.selectedFile) {
      formData.append('file', this.selectedFile);
    }
  
    this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
      next: async (response) => {
        console.log('Message envoyé, ID:', response.message_id);
        this.refreshMessages();
        this.messageContent = '';
        this.selectedFile = null;
        await this.presentAlert('Succès', 'Message envoyé avec succès.');
      },
      error: async (error) => {
        console.error('Erreur complète:', error);
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’envoi du message.');
      }
    });
  }
  
  // Ajouter une méthode pour ouvrir une session sans dépendre d'une réponse préalable
  startNewSession(farmerUsername: string, expertUsername: string) {
    this.currentSession = { farmerUsername, expertUsername };
    this.refreshMessages();
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
    if (!this.currentSession) return;

    this.localStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true });
    this.peer = new Peer({ initiator: true, trickle: false, stream: this.localStream });

    this.peer.on('signal', (data) => {
      const formData = new FormData();
      formData.append('message_type', `${type}_call_signal`);
      formData.append('content', JSON.stringify(data));
      if (this.currentSession) {
        this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
          next: () => console.log('Signal envoyé'),
          error: (error) => console.error('Erreur signal:', error)
        });
      }
    });

    this.peer.on('stream', (stream) => {
      const element = document.createElement(type === 'video' ? 'video' : 'audio');
      element.srcObject = stream;
      element.autoplay = true;
      document.querySelector('.messages-container')?.appendChild(element);
    });

    const formData = new FormData();
    formData.append('message_type', `${type}_call`);
    formData.append('content', `${type} call initiated`);
    this.apiService.sendPrivateMessage(this.currentSession.farmerUsername, this.currentSession.expertUsername, formData).subscribe({
      next: async () => {
        this.refreshMessages();
        await this.presentAlert('Succès', `${type} call initié avec succès.`);
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de l’initiation de l’appel.');
      }
    });
  }

  acceptCall(signalData: any) {
    if (!this.localStream || !this.currentSession) return;

    this.peer = new Peer({ initiator: false, trickle: false, stream: this.localStream });
    this.peer.signal(signalData);

    this.peer.on('stream', (stream) => {
      const element = document.createElement('video');
      element.srcObject = stream;
      element.autoplay = true;
      document.querySelector('.messages-container')?.appendChild(element);
    });
  }

  deleteSession() {
    if (!this.currentSession) return;
    this.apiService.deleteSession(this.currentSession.farmerUsername, this.currentSession.expertUsername).subscribe({
      next: async () => {
        this.closeChat();
        this.loadSessions();
        await this.presentAlert('Succès', 'Session supprimée avec succès.');
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la suppression de la session.');
      }
    });
  }

  closeChat() {
    this.currentSession = null;
    this.sessionMessages = [];
    this.peer?.destroy();
    this.localStream?.getTracks().forEach(track => track.stop());
  }

  async presentAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }
}