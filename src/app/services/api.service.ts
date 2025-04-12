import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { WebsocketService } from './websocket.service';

// Interfaces existantes (inchangées sauf ajout de LiveSession)
export interface ChatResponse {
  response: string;
  created_at: string;
  conversation_id: string;
}

export interface PublicRequest {
  request_id: number;
  username: string;
  request_type: string;
  content: string;
  created_at: string;
  responded?: boolean;
}

export interface Session {
  session_id: number;
  farmer_username: string;
  expert_username: string;
  request_id: number | null;
  last_message: string | null;
  created_at: string;
}

export interface PlantDetectionResponse {
  disease: string;
  recommendation: string;
  image_path: string;
  confidence?: number;
}

export interface SessionMessage {
  id: number;
  session_id: number;
  sender_username: string;
  message_type: string;
  content: string;
  created_at: string;
  status?: 'sent' | 'received' | 'read';
  request_id?: number;
}

export interface ChatMessage {
  id: number;
  message: string;
  response: string;
  created_at: string;
}

export interface ChatHistory {
  conversation_id: string;
  messages: ChatMessage[];
}

export interface Conversation {
  id: string;
}

export interface PrivateMessageResponse {
  message_id: number;
  content?: string;
}

export interface WeatherResponse {
  city: string;
  temperature: number;
  description: string;
}

export interface CallLog {
  id: number;
  type: 'audio' | 'video';
  caller: string;
  receiver: string;
  status: 'ongoing' | 'received' | 'missed' | 'ended';
  timestamp: string;
}

export interface ForecastResponse {
  timestamp: string;
  temperature: number;
  description: string;
}

export interface LiveComment {
  username: string;
  comment: string;
  created_at: string;
}

export interface LiveSession {
  session_id: number;
  expert_username: string;
  stream_url: string;
  stream_type: 'hls' | 'srs';
  title: string;
  started_at: string;
  ended_at?: string;
  status: 'active' | 'ended';
}

export interface ProfileResponse {
  username: string;
  email: string;
  role: string;
  id?: string;
  is_admin?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://192.168.1.90:5000';

  constructor(private http: HttpClient, private websocketService: WebsocketService) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    console.log('Token envoyé dans les headers:', token);
    let headers = new HttpHeaders({
      'Accept': 'application/json'
    });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Une erreur est survenue, veuillez réessayer.';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Erreur réseau : ${error.error.message}`;
    } else {
      switch (error.status) {
        case 400:
          errorMessage = error.error?.message || 'Requête invalide.';
          break;
        case 401:
          errorMessage = 'Session expirée, veuillez vous reconnecter.';
          this.logout();
          break;
        case 403:
          errorMessage = error.error?.message || 'Accès refusé : vous n’avez pas les permissions nécessaires.';
          break;
        case 404:
          errorMessage = error.error?.message || 'Ressource non trouvée.';
          break;
        case 500:
          errorMessage = 'Erreur serveur, veuillez réessayer plus tard.';
          break;
        default:
          errorMessage = error.error?.message || 'Erreur inattendue.';
      }
    }
    console.error(`Erreur HTTP ${error.status}: ${errorMessage}`, error);
    return throwError(() => new Error(errorMessage));
  }

  login(email: string, password: string): Observable<{ access_token: string; role: string; user: { id: number; username: string } }> {
    return this.http.post<{ access_token: string; role: string; user: { id: number; username: string } }>(
      `${this.baseUrl}/auth/login`,
      { email, password },
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        console.log('Réponse login:', response);
        if (!response.access_token || !response.role || !response.user || !response.user.id) {
          throw new Error('Réponse du serveur invalide : champs manquants.');
        }
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('role', response.role);
        localStorage.setItem('user_id', response.user.id.toString());
        console.log('user_id stocké:', response.user.id);
        this.websocketService.connect(); // Initialiser la connexion WebSocket après login
      }),
      catchError(this.handleError)
    );
  }

  private get_jwt_identity_from_token(token: string): string {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub;
    } catch (e) {
      console.error('Erreur lors du décodage du token JWT:', e);
      return '';
    }
  }

  register(username: string, email: string, password: string, confirmPassword: string, role: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/auth/register`,
      { username, email, password, confirm_password: confirmPassword, role },
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/auth/reset-password/request`,
      { email },
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  sendPublicRequest(formData: FormData): Observable<{ request_id: number }> {
    return this.http.post<{ request_id: number }>(
      `${this.baseUrl}/expert/public_request`,
      formData,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  getPublicRequests(): Observable<PublicRequest[]> {
    return this.http.get<PublicRequest[]>(
      `${this.baseUrl}/expert/public_request`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  respondToRequest(requestId: number, formData: FormData): Observable<{ farmer_username: string; expert_username: string }> {
    return this.http.post<{ farmer_username: string; expert_username: string }>(
      `${this.baseUrl}/expert/public_request/${requestId}/respond`,
      formData,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  sendPrivateMessage(farmerUsername: string, expertUsername: string, formData: FormData): Observable<PrivateMessageResponse> {
    const cleanFarmer = farmerUsername.trim();
    const cleanExpert = expertUsername.trim();
    const url = `${this.baseUrl}/expert/session/${encodeURIComponent(cleanFarmer)}/${encodeURIComponent(cleanExpert)}/message`;
    console.log('Envoi message privé à:', url, 'avec données:', Array.from((formData as any).entries()));
    return this.http.post<PrivateMessageResponse>(url, formData, { headers: this.getHeaders() }).pipe(
      tap(response => console.log('Réponse sendPrivateMessage:', response)),
      catchError(error => {
        if (error.status === 401) {
          console.log('Token expiré, tentative de déconnexion.');
          this.logout();
          return throwError(() => new Error('Session expirée, veuillez vous reconnecter.'));
        }
        return this.handleError(error);
      })
    );
  }

  getSessionMessages(farmerUsername: string, expertUsername: string, requestId?: number): Observable<SessionMessage[]> {
    let url = `${this.baseUrl}/expert/session/${encodeURIComponent(farmerUsername)}/${encodeURIComponent(expertUsername)}/messages`;
    if (requestId !== undefined) {
      url += `?request_id=${requestId}`;
    }
    console.log('Récupération messages session:', url);
    return this.http.get<SessionMessage[]>(url, { headers: this.getHeaders() }).pipe(
      tap(messages => console.log('Messages récupérés:', messages)),
      catchError(error => {
        if (error.status === 404) {
          return throwError(() => new Error('Aucun message trouvé pour cette session.'));
        } else if (error.status === 403) {
          return throwError(() => new Error('Accès refusé : vous n’êtes pas autorisé à voir ces messages.'));
        }
        return this.handleError(error);
      })
    );
  }

  getUserSessions(): Observable<Session[]> {
    return this.http.get<Session[]>(
      `${this.baseUrl}/expert/sessions`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(sessions => console.log('Sessions récupérées:', sessions)),
      catchError(this.handleError)
    );
  }

  deleteSession(farmerUsername: string, expertUsername: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/expert/session/${encodeURIComponent(farmerUsername)}/${encodeURIComponent(expertUsername)}`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  endSession(farmerUsername: string, expertUsername: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/expert/session/${encodeURIComponent(farmerUsername)}/${encodeURIComponent(expertUsername)}/end`,
      {},
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  getLiveComments(): Observable<LiveComment[]> {
    return this.http.get<LiveComment[]>(
      `${this.baseUrl}/live/comments`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  postLiveComment(comment: string): Observable<{ message: string }> {
    console.log('Envoi du commentaire :', comment);
    const headers = this.getHeaders();
    console.log('Headers envoyés :', headers);
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/live/comment`,
      { comment },
      { headers }
    ).pipe(
      tap(response => console.log('Réponse brute du serveur :', response)),
      catchError(this.handleError)
    );
  }

  getLiveSessions(): Observable<LiveSession[]> {
    return this.http.get<LiveSession[]>(
      `${this.baseUrl}/live/sessions`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(sessions => console.log('Sessions live récupérées:', sessions)),
      catchError(this.handleError)
    );
  }

  // Nouvelle méthode : Récupérer les sessions live d’un expert spécifique
  getExpertLiveSessions(): Observable<LiveSession[]> {
    return this.http.get<LiveSession[]>(
      `${this.baseUrl}/live/expert/sessions`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(sessions => console.log('Sessions live de l’expert récupérées:', sessions)),
      catchError(this.handleError)
    );
  }

  // Nouvelle méthode : Supprimer une session live spécifique
  deleteLiveSession(sessionId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/live/session/${sessionId}`,
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => console.log('Session live supprimée:', response)),
      catchError(this.handleError)
    );
  }

  getExpertMessages(): Observable<PublicRequest[]> {
    return this.http.get<PublicRequest[]>(
      `${this.baseUrl}/expert/public_request`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  sendChatMessage(message: string, conversationId: string | null): Observable<ChatResponse> {
    if (!conversationId) {
      return throwError(() => new Error('L’ID de la conversation est requis.'));
    }
    return this.http.post<ChatResponse>(
      `${this.baseUrl}/chat/send`,
      { message, conversation_id: conversationId },
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  getChatHistory(): Observable<ChatHistory[]> {
    return this.http.get<ChatHistory[]>(
      `${this.baseUrl}/chat/history`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  clearChatHistory(): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/chat/history/delete`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  updateCallStatus(farmerUsername: string, expertUsername: string, callId: number, status: 'ongoing' | 'received' | 'missed' | 'ended'): Observable<{ message: string }> {
    const url = `${this.baseUrl}/expert/session/${encodeURIComponent(farmerUsername)}/${encodeURIComponent(expertUsername)}/call_status`;
    const body = { call_id: callId, status };
    console.log('Mise à jour statut appel:', url, body);
    return this.http.post<{ message: string }>(url, body, { headers: this.getHeaders() }).pipe(
      tap(response => console.log('Statut appel mis à jour:', response)),
      catchError(this.handleError)
    );
  }

  getCallLogs(farmerUsername: string, expertUsername: string, requestId?: number): Observable<CallLog[]> {
    let url = `${this.baseUrl}/expert/session/${encodeURIComponent(farmerUsername)}/${encodeURIComponent(expertUsername)}/call_logs`;
    if (requestId !== undefined) {
      url += `?request_id=${requestId}`;
    }
    console.log('Récupération logs appels:', url);
    return this.http.get<CallLog[]>(url, { headers: this.getHeaders() }).pipe(
      tap(logs => console.log('Logs appels récupérés:', logs)),
      catchError(this.handleError)
    );
  }

  getConversations(): Observable<ChatHistory[]> {
    return this.http.get<ChatHistory[]>(
      `${this.baseUrl}/chat/history`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  createConversation(): Observable<Conversation> {
    return this.http.post<Conversation>(
      `${this.baseUrl}/chat/conversations`,
      {},
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  deleteConversation(conversationId: string): Observable<{ message: string }> {
    if (!conversationId) {
      return throwError(() => new Error('L’ID de la conversation est requis.'));
    }
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/chat/conversations/${conversationId}`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  deleteMessage(messageId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/chat/messages/${messageId}`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  updateMessage(messageId: number, newMessage: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(
      `${this.baseUrl}/chat/messages/${messageId}`,
      { message: newMessage },
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  detectPlantDisease(file: File): Observable<PlantDetectionResponse> {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<PlantDetectionResponse>(
      `${this.baseUrl}/plant/detect`,
      formData,
      { headers: new HttpHeaders({ 'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}` }) }
    ).pipe(catchError(this.handleError));
  }

  getWeather(city: string = 'Dakar'): Observable<WeatherResponse> {
    const url = `${this.baseUrl}/weather/local`;
    return this.http.get<WeatherResponse>(url, {
      headers: this.getHeaders(),
      params: { city }
    }).pipe(catchError(this.handleError));
  }

  getFavoriteCities(): Observable<{ favorite_cities: string[] }> {
    return this.http.get<{ favorite_cities: string[] }>(
      `${this.baseUrl}/weather/favorites`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  addFavoriteCity(city: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/weather/favorites`,
      { city },
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  removeFavoriteCity(city: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/weather/favorites/${city}`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  getWeatherByCoords(lat: number, lon: number): Observable<WeatherResponse> {
    const url = `${this.baseUrl}/weather/local`;
    return this.http.get<WeatherResponse>(url, {
      headers: this.getHeaders(),
      params: { lat: lat.toString(), lon: lon.toString() }
    }).pipe(catchError(this.handleError));
  }

  getHourlyForecast(city: string): Observable<ForecastResponse[]> {
    const url = `${this.baseUrl}/weather/forecast`;
    return this.http.get<ForecastResponse[]>(url, {
      headers: this.getHeaders(),
      params: { city }
    }).pipe(catchError(this.handleError));
  }

  getHourlyForecastByCoords(lat: number, lon: number): Observable<ForecastResponse[]> {
    const url = `${this.baseUrl}/weather/forecast`;
    return this.http.get<ForecastResponse[]>(url, {
      headers: this.getHeaders(),
      params: { lat: lat.toString(), lon: lon.toString() }
    }).pipe(catchError(this.handleError));
  }

  getProfile(): Observable<ProfileResponse> {
    const url = `${this.baseUrl}/auth/profile`;
    return this.http.get<ProfileResponse>(url, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError)
    );
  }

  updateProfile(data: { username?: string; email?: string }): Observable<ProfileResponse> {
    const url = `${this.baseUrl}/auth/profile`;
    return this.http.put<ProfileResponse>(url, data, { headers: this.getHeaders() }).pipe(
      catchError(this.handleError)
    );
  }

  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.baseUrl}/admin/users`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  createUser(userData: { username: string; email: string; password?: string; role: string; is_admin: boolean }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/admin/users`,
      userData,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  updateUser(userId: number, userData: { username: string; email: string; role: string; is_admin: boolean }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(
      `${this.baseUrl}/admin/users/${userId}`,
      userData,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  deleteUser(userId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/admin/users/${userId}`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  logout(): void {
    this.websocketService.disconnect();
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    localStorage.removeItem('user_id');
  }
}