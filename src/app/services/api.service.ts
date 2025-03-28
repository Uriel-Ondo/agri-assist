import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, forkJoin } from 'rxjs';
import { catchError, tap, switchMap } from 'rxjs/operators';

// Interfaces pour typage des réponses
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
  confidence?: number;  // Ajouté
}

export interface SessionMessage {
  id: number;
  sender_username: string;
  message_type: string;
  content: string;
  created_at: string;
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

export interface WeatherResponse {
  city: string;
  temperature: number;
  description: string;
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

export interface ProfileResponse {
  username: string;
  email: string;
  role: string;
  id?: string;
  is_admin?: boolean; // Ajouté pour refléter si l'utilisateur est admin
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://127.0.0.1:5000';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    let headers = new HttpHeaders({
      'Accept': 'application/json'
    });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 401) {
      this.logout();
      return throwError(() => new Error('Session expirée, veuillez vous reconnecter.'));
    } else if (error.status === 400) {
      return throwError(() => new Error(error.error?.message || 'Requête invalide.'));
    } else if (error.status === 500) {
      return throwError(() => new Error('Erreur serveur, veuillez réessayer plus tard.'));
    }
    return throwError(() => new Error('Une erreur est survenue, veuillez réessayer.'));
  }

  login(email: string, password: string): Observable<{ access_token: string; role: string; user_id: string }> {
    return this.http.post<{ access_token: string; role: string; user_id: string }>(
      `${this.baseUrl}/auth/login`,
      { email, password },
      { headers: this.getHeaders() }
    ).pipe(
      tap(response => {
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('role', response.role);
        localStorage.setItem('user_id', response.user_id);
      }),
      catchError(this.handleError)
    );
  }

  private get_jwt_identity_from_token(token: string): string {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub; // 'sub' contient l'identity (user_id)
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
    ).pipe(
      catchError(this.handleError)
    );
  }

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/auth/reset-password/request`,
      { email },
      { headers: this.getHeaders() }
    ).pipe(
      catchError(this.handleError)
    );
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

  sendPrivateMessage(farmerUsername: string, expertUsername: string, formData: FormData): Observable<{ message_id: number }> {
    return this.http.post<{ message_id: number }>(
      `${this.baseUrl}/expert/session/${farmerUsername}/${expertUsername}/message`,
      formData,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }
  getSessionMessages(farmerUsername: string, expertUsername: string): Observable<SessionMessage[]> {
    return this.http.get<SessionMessage[]>(
      `${this.baseUrl}/expert/session/${farmerUsername}/${expertUsername}/messages`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  getUserSessions(): Observable<Session[]> {
    return this.http.get<Session[]>(
      `${this.baseUrl}/expert/sessions`,
      { headers: this.getHeaders() }
    ).pipe(catchError(this.handleError));
  }

  deleteSession(farmerUsername: string, expertUsername: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/expert/session/${farmerUsername}/${expertUsername}`,
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
    console.log('Envoi du commentaire :', comment); // Log avant envoi
    const headers = this.getHeaders();
    console.log('Headers envoyés :', headers); // Vérifier le token
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/live/comment`,
      { comment },
      { headers }
    ).pipe(
      tap(response => console.log('Réponse brute du serveur :', response)), // Log succès brut
      catchError(error => {
        console.error('Erreur brute lors de la soumission :', error);
        return this.handleError(error);
      })
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
      return throwError(() => new Error('L\'ID de la conversation est requis.'));
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
      return throwError(() => new Error('L\'ID de la conversation est requis.'));
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
    const headers = this.getHeaders();
    return this.http.get<WeatherResponse>(url, {
      headers,
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
    const headers = this.getHeaders();
    return this.http.get<WeatherResponse>(url, {
      headers,
      params: {
        lat: lat.toString(),
        lon: lon.toString()
      }
    }).pipe(catchError(this.handleError));
  }

  getHourlyForecast(city: string): Observable<ForecastResponse[]> {
    const url = `${this.baseUrl}/weather/forecast`;
    const headers = this.getHeaders();
    return this.http.get<ForecastResponse[]>(url, {
      headers,
      params: { city }
    }).pipe(catchError(this.handleError));
  }

  getHourlyForecastByCoords(lat: number, lon: number): Observable<ForecastResponse[]> {
    const url = `${this.baseUrl}/weather/forecast`;
    const headers = this.getHeaders();
    return this.http.get<ForecastResponse[]>(url, {
      headers,
      params: {
        lat: lat.toString(),
        lon: lon.toString()
      }
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

  // Mise à jour pour inclure role
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
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    localStorage.removeItem('user_id');
  }
}