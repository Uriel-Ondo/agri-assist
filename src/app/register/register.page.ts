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
  role: string = ''; // Ajout du rôle

  constructor(
    private apiService: ApiService,
    private router: Router,
    private alertController: AlertController
  ) {}

  async register() {
    if (this.password !== this.confirmPassword) {
      this.presentAlert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }

    if (!this.role) {
      this.presentAlert('Erreur', 'Veuillez sélectionner un rôle.');
      return;
    }

    this.apiService.register(this.username, this.email, this.password, this.confirmPassword, this.role).subscribe({
      next: () => {
        this.presentAlert('Succès', 'Inscription réussie ! Vous pouvez maintenant vous connecter.');
        this.router.navigate(['/login']);
      },
      error: (error: any) => {
        console.error('Erreur lors de l\'inscription:', error);
        this.presentAlert('Erreur', error.message || 'Erreur lors de l\'inscription.');
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
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