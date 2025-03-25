import { Component } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular'; // Ajout de AlertController ici
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class LoginPage {
  email: string = '';
  password: string = '';

  constructor(
    private apiService: ApiService,
    private router: Router,
    private alertController: AlertController
  ) {}

  async login() {
    this.apiService.login(this.email, this.password).subscribe({
      next: (response: any) => {
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('role', response.role);
        localStorage.setItem('user_id', response.user_id);
        this.router.navigate(['/tabs/home']);
      },
      error: (error: any) => {
        console.error('Erreur lors de la connexion:', error);
        this.presentAlert('Erreur', error.message || 'Identifiants invalides.');
      }
    });
  }

  async forgotPassword() {
    const alert = await this.alertController.create({
      header: 'Mot de passe oublié',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Entrez votre email'
        }
      ],
      buttons: [
        {
          text: 'Annuler',
          role: 'cancel'
        },
        {
          text: 'Envoyer',
          handler: (data) => {
            this.apiService.requestPasswordReset(data.email).subscribe({
              next: () => this.presentAlert('Succès', 'Un lien de réinitialisation a été envoyé à votre email.'),
              error: (error) => this.presentAlert('Erreur', error.message || 'Erreur lors de la demande.')
            });
          }
        }
      ]
    });
    await alert.present();
  }

  goToRegister() {
    this.router.navigate(['/register']);
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