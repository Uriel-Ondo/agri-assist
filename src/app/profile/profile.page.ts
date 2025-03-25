import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ApiService } from '../services/api.service';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ProfilePage implements OnInit {
  profile: any = { username: '', email: '', role: '', is_admin: false };
  isEditing: boolean = false;
  updatedProfile: { username?: string; email?: string } = {};

  constructor(
    private apiService: ApiService,
    private router: Router,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.apiService.getProfile().subscribe({
      next: (data: any) => {
        this.profile = data;
        this.updatedProfile = { username: data.username, email: data.email };
      },
      error: (error: any) => {
        console.error('Erreur lors de la récupération du profil:', error);
        this.presentAlert('Erreur', 'Impossible de charger le profil.');
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
      this.presentAlert('Information', 'Aucune modification détectée.');
      this.isEditing = false;
      return;
    }

    this.apiService.updateProfile(this.updatedProfile).subscribe({
      next: (response: any) => {
        this.profile = { ...this.profile, ...response };
        this.isEditing = false;
        this.presentAlert('Succès', 'Profil mis à jour avec succès.');
      },
      error: (error: any) => {
        console.error('Erreur lors de la mise à jour du profil:', error);
        let errorMessage = 'Erreur lors de la mise à jour du profil.';
        if (error.error.message) {
          errorMessage = error.error.message;
        }
        this.presentAlert('Erreur', errorMessage);
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
          handler: () => {
            this.apiService.logout();
            this.router.navigate(['/login']);
            this.presentAlert('Succès', 'Vous êtes déconnecté.');
          }
        }
      ]
    });
    await alert.present();
  }

  goToDashboard() {
    this.router.navigate(['/admin']);
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