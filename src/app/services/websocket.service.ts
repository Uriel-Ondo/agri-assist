import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { SessionMessage, LiveComment } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket: Socket | null = null;
  private baseUrl = 'http://192.168.1.90:5000'; // Confirmé fonctionnel avec curl
  private connectionStatus = new Subject<boolean>();
  private messageSubject = new Subject<SessionMessage | LiveComment>();
  private publicRequestSubject = new Subject<any>();
  private sessionStartedSubject = new Subject<any>();
  private sessionEndedSubject = new Subject<any>();
  private sessionDeletedSubject = new Subject<any>();
  private messageStatusSubject = new Subject<{ message_id: number; status: string }>();
  private callStatusSubject = new Subject<{ session_id: number; call_id: number; status: string }>();
  private liveStartedSubject = new Subject<any>();
  private liveEndedSubject = new Subject<any>();

  constructor() {}

  connect(namespace: string = 'expert'): void {
    if (this.socket && this.socket.connected) {
      console.log(`WebSocket déjà connecté au namespace /${namespace}`);
      return;
    }

    const token = localStorage.getItem('access_token');
    const userId = localStorage.getItem('user_id');

    console.log(`Tentative de connexion WebSocket au namespace /${namespace} - token: ${token}, userId: ${userId}`);

    if (!token || !userId) {
      console.error('Token ou user_id manquant pour la connexion WebSocket');
      this.connectionStatus.next(false);
      return;
    }

    this.socket = io(`${this.baseUrl}/${namespace}`, {
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 10, // Limiter les tentatives pour éviter les boucles infinies
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'], // Forcer WebSocket uniquement
      query: { user_id: userId },
      auth: { token }
    });

    this.socket.on('connect', () => {
      console.log(`Connecté au serveur WebSocket /${namespace} - socket ID: ${this.socket?.id}`);
      this.connectionStatus.next(true);
    });

    this.socket.on('connect_error', (error) => {
      console.error(`Erreur de connexion WebSocket /${namespace}: ${error.message}`, error);
      this.connectionStatus.next(false);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`Déconnecté du serveur WebSocket /${namespace} - raison: ${reason}`);
      this.connectionStatus.next(false);
    });

    this.socket.on('error', (data) => {
      console.error(`Erreur serveur WebSocket /${namespace}:`, data);
    });

    // Événements pour /expert
    if (namespace === 'expert') {
      this.socket.on('new_private_message', (data: SessionMessage) => {
        console.log('Nouveau message privé reçu:', data);
        this.messageSubject.next(data);
      });

      this.socket.on('new_public_request', (data: any) => {
        console.log('Nouvelle demande publique reçue:', data);
        this.publicRequestSubject.next(data);
      });

      this.socket.on('private_session_started', (data: any) => {
        console.log('Session privée démarrée:', data);
        this.sessionStartedSubject.next(data);
      });

      this.socket.on('session_ended', (data: any) => {
        console.log('Session terminée:', data);
        this.sessionEndedSubject.next(data);
      });

      this.socket.on('session_deleted', (data: any) => {
        console.log('Session supprimée:', data);
        this.sessionDeletedSubject.next(data);
      });

      this.socket.on('message_status_update', (data: { message_id: number; status: string }) => {
        console.log('Mise à jour statut message:', data);
        this.messageStatusSubject.next(data);
      });

      this.socket.on('call_status_update', (data: { session_id: number; call_id: number; status: string }) => {
        console.log('Mise à jour statut appel:', data);
        this.callStatusSubject.next(data);
      });

      this.socket.on('start_live', (data: any) => {
        console.log('Début de session live (expert):', data);
        this.liveStartedSubject.next(data);
      });

      this.socket.on('end_live', (data: any) => {
        console.log('Fin de session live (expert):', data);
        this.liveEndedSubject.next(data);
      });
    }

    // Événements pour /live
    if (namespace === 'live') {
      this.socket.on('new_comment', (data: LiveComment) => {
        console.log('Nouveau commentaire reçu:', data);
        this.messageSubject.next(data);
      });

      this.socket.on('live_started', (data: any) => {
        console.log('Session live démarrée:', data);
        this.liveStartedSubject.next(data);
      });

      this.socket.on('live_ended', (data: any) => {
        console.log('Session live terminée:', data);
        this.liveEndedSubject.next(data);
      });
    }
  }

  getConnectionStatus(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  getNewMessage(): Observable<SessionMessage | LiveComment> {
    return new Observable(observer => {
      if (!this.socket) {
        console.error('Socket non initialisé. Assurez-vous que connect() a été appelé.');
        observer.error('WebSocket non connecté');
        return;
      }

      this.socket.on('new_private_message', (data: SessionMessage) => observer.next(data));
      this.socket.on('new_comment', (data: LiveComment) => observer.next(data));
      this.socket.on('connect_error', (error) => observer.error(error));

      return () => {
        if (this.socket) {
          this.socket.off('new_private_message');
          this.socket.off('new_comment');
          this.socket.off('connect_error');
        }
      };
    });
  }

  getNewPublicRequest(): Observable<any> {
    return this.publicRequestSubject.asObservable();
  }

  getSessionStarted(): Observable<any> {
    return this.sessionStartedSubject.asObservable();
  }

  getSessionEnded(): Observable<any> {
    return this.sessionEndedSubject.asObservable();
  }

  getSessionDeleted(): Observable<any> {
    return this.sessionDeletedSubject.asObservable();
  }

  getMessageStatusUpdate(): Observable<{ message_id: number; status: string }> {
    return this.messageStatusSubject.asObservable();
  }

  getCallStatusUpdate(): Observable<{ session_id: number; call_id: number; status: string }> {
    return this.callStatusSubject.asObservable();
  }

  getLiveStarted(): Observable<any> {
    return this.liveStartedSubject.asObservable();
  }

  getLiveEnded(): Observable<any> {
    return this.liveEndedSubject.asObservable();
  }

  joinSession(sessionId: number): void {
    if (this.socket && this.socket.connected) {
      console.log('Émission join_session pour sessionId:', sessionId);
      this.socket.emit('join_session', { session_id: sessionId }, (response: any) => {
        console.log('Réponse de join_session:', response);
        if (response && response.status === 'success') {
          console.log('Rejoint la session avec succès:', sessionId);
        } else {
          console.error('Échec de rejoindre la session:', response?.error || 'Aucune réponse');
        }
      });
    } else {
      console.error('Socket non connecté pour join_session');
    }
  }

  markMessageAsRead(sessionId: number, messageId: number): void {
    if (this.socket && this.socket.connected) {
      console.log('Émission mark_message_read - sessionId:', sessionId, 'messageId:', messageId);
      this.socket.emit('mark_message_read', { session_id: sessionId, message_id: messageId }, (response: any) => {
        if (response) {
          console.log('Message marqué comme lu:', messageId);
        } else {
          console.error('Échec de marquage du message:', messageId);
        }
      });
    } else {
      console.error('Socket non connecté pour mark_message_read');
    }
  }

  startLive(streamUrl: string, streamType: 'hls' | 'srs', title: string): void {
    if (this.socket && this.socket.connected) {
      console.log('Émission start_live:', { stream_url: streamUrl, stream_type: streamType, title });
      this.socket.emit('start_live', { stream_url: streamUrl, stream_type: streamType, title }, (response: any) => {
        if (response && !response.error) {
          console.log('Live démarré avec succès');
        } else {
          console.error('Échec du démarrage du live:', response?.error || 'Aucune réponse');
        }
      });
    } else {
      console.error('Socket non connecté pour start_live');
    }
  }

  endLive(sessionId: number): void {
    if (this.socket && this.socket.connected) {
      console.log('Émission end_live pour sessionId:', sessionId);
      this.socket.emit('end_live', { session_id: sessionId }, (response: any) => {
        if (response && !response.error) {
          console.log('Live terminé avec succès');
        } else {
          console.error('Échec de la fin du live:', response?.error || 'Aucune réponse');
        }
      });
    } else {
      console.error('Socket non connecté pour end_live');
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      console.log('Déconnexion manuelle du WebSocket');
      this.socket = null;
      this.connectionStatus.next(false);
    }
  }
}