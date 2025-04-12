import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class RegisterPage {
  username: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  role: string = ''; // 'farmer' ou 'expert'

  constructor(
    private apiService: ApiService,
    private router: Router,
    private alertController: AlertController
  ) {}

  async register() {
    // Validation des champs
    if (!this.username || !this.email || !this.password || !this.confirmPassword || !this.role) {
      this.presentAlert('Erreur', 'Tous les champs sont requis.');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.presentAlert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }

    if (!['farmer', 'expert'].includes(this.role)) {
      this.presentAlert('Erreur', 'Rôle invalide. Choisissez "farmer" ou "expert".');
      return;
    }

    try {
      this.apiService.register(this.username, this.email, this.password, this.confirmPassword, this.role).subscribe({
        next: async () => {
          await this.presentAlert('Succès', 'Inscription réussie ! Vous pouvez maintenant vous connecter.');
          this.router.navigate(['/login']).catch(err => {
            console.error('Erreur de navigation vers login:', err);
          });
        },
        error: async (error: any) => {
          console.error('Erreur lors de l\'inscription:', error);
          await this.presentAlert('Erreur', error.message || 'Erreur lors de l\'inscription.');
        }
      });
    } catch (err) {
      console.error('Erreur inattendue dans register:', err);
      await this.presentAlert('Erreur', 'Une erreur inattendue est survenue.');
    }
  }

  goToLogin() {
    this.router.navigate(['/login']).catch(err => {
      console.error('Erreur de navigation vers login:', err);
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
}