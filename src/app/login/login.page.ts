import { Component } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
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
    if (!this.email || !this.password) {
      await this.presentAlert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }

    try {
      this.apiService.login(this.email, this.password).subscribe({
        next: async (response: { access_token: string; role: string; user: { id: number; username: string } }) => {
          console.log('Réponse de connexion:', response);
          if (!response.access_token || !response.role || !response.user || !response.user.id) {
            console.error('Structure de réponse invalide:', response);
            await this.presentAlert('Erreur', 'Réponse du serveur invalide. Veuillez réessayer.');
            return;
          }
          localStorage.setItem('access_token', response.access_token);
          localStorage.setItem('role', response.role);
          localStorage.setItem('user_id', String(response.user.id));
          console.log('user_id stocké:', localStorage.getItem('user_id'));

          await this.router.navigate(['/tabs/home']);
          console.log('Navigation vers /tabs/home réussie');
        },
        error: async (error: any) => {
          console.error('Erreur lors de la connexion:', error);
          await this.presentAlert('Erreur', error.message || 'Identifiants invalides.');
        }
      });
    } catch (err) {
      console.error('Erreur inattendue dans login:', err);
      await this.presentAlert('Erreur', 'Une erreur inattendue est survenue.');
    }
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
        { text: 'Annuler', role: 'cancel' },
        {
          text: 'Envoyer',
          handler: async (data) => {
            if (!data.email) {
              await this.presentAlert('Erreur', 'Veuillez entrer un email.');
              return;
            }
            this.apiService.requestPasswordReset(data.email).subscribe({
              next: async () => {
                await this.presentAlert('Succès', 'Un lien de réinitialisation a été envoyé à votre email.');
              },
              error: async (error) => {
                await this.presentAlert('Erreur', error.message || 'Erreur lors de la demande.');
              }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  goToRegister() {
    this.router.navigate(['/register']).catch(err => {
      console.error('Erreur de navigation vers register:', err);
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