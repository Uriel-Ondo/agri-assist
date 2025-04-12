import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ApiService } from '../services/api.service';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebsocketService } from '../services/websocket.service'; // Ajout pour vérifier la connexion
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ProfilePage implements OnInit, OnDestroy {
  profile: any = { username: '', email: '', role: '', is_admin: false };
  isEditing: boolean = false;
  updatedProfile: { username?: string; email?: string } = {};
  isConnected: boolean = false; // État de la connexion WebSocket
  private subscriptions: Subscription[] = [];

  constructor(
    private apiService: ApiService,
    private websocketService: WebsocketService, // Ajout du service WebSocket
    private router: Router,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.loadProfile();
    // Écouter l'état de la connexion WebSocket
    this.subscriptions.push(
      this.websocketService.getConnectionStatus().subscribe(status => {
        this.isConnected = status;
        console.log('État WebSocket dans Profile:', status);
      })
    );

    // Vérifier si l'utilisateur est déjà connecté
    const token = localStorage.getItem('access_token');
    if (token && !this.isConnected) {
      this.websocketService.connect();
    }
  }

  loadProfile() {
    this.apiService.getProfile().subscribe({
      next: (data: any) => {
        this.profile = data;
        this.updatedProfile = { username: data.username, email: data.email };
      },
      error: async (error: any) => {
        console.error('Erreur lors de la récupération du profil:', error);
        await this.presentAlert('Erreur', 'Impossible de charger le profil.');
      }
    });
  }

  toggleEdit() {
    this.isEditing = !this.isEditing;
    if (!this.isEditing) {
      this.updatedProfile = { username: this.profile.username, email: this.profile.email };
    }
  }

  async saveProfile() {
    const hasChanges =
      this.updatedProfile.username !== this.profile.username ||
      this.updatedProfile.email !== this.profile.email;

    if (!hasChanges) {
      await this.presentAlert('Information', 'Aucune modification détectée.');
      this.isEditing = false;
      return;
    }

    this.apiService.updateProfile(this.updatedProfile).subscribe({
      next: async (response: any) => {
        this.profile = { ...this.profile, ...response };
        this.isEditing = false;
        await this.presentAlert('Succès', 'Profil mis à jour avec succès.');
      },
      error: async (error: any) => {
        console.error('Erreur lors de la mise à jour du profil:', error);
        let errorMessage = error.message || 'Erreur lors de la mise à jour du profil.';
        await this.presentAlert('Erreur', errorMessage);
      }
    });
  }

  async logout() {
    const alert = await this.alertController.create({
      header: 'Déconnexion',
      message: 'Êtes-vous sûr de vouloir vous déconnecter ?',
      buttons: [
        {
          text: 'Annuler',
          role: 'cancel'
        },
        {
          text: 'Oui',
          handler: async () => {
            this.apiService.logout(); // Déconnecte WebSocket et vide localStorage
            await this.presentAlert('Succès', 'Vous êtes déconnecté.');
            this.router.navigate(['/login']).catch(err => {
              console.error('Erreur de navigation vers login:', err);
            });
          }
        }
      ]
    });
    await alert.present();
  }

  goToDashboard() {
    this.router.navigate(['/admin']).catch(err => {
      console.error('Erreur de navigation vers admin:', err);
    });
  }

  async presentAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    // Ne pas déconnecter WebSocket ici pour maintenir la session active
  }
}