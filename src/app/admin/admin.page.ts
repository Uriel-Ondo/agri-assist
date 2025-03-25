import { Component, OnInit } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ApiService } from '../services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminPage implements OnInit {
  users: any[] = []; // Liste complète des utilisateurs
  filteredUsers: any[] = []; // Liste filtrée par recherche
  paginatedUsers: any[] = []; // Liste paginée à afficher
  isAdding: boolean = false;
  isEditing: boolean = false;
  searchQuery: string = ''; // Requête de recherche
  currentPage: number = 1; // Page actuelle
  pageSize: number = 50; // Taille de la page (50 utilisateurs)
  totalPages: number = 1; // Nombre total de pages
  newUser: { username: string; email: string; password: string; role: string; is_admin: boolean } = {
    username: '',
    email: '',
    password: '',
    role: 'farmer',
    is_admin: false
  };
  editedUser: { id?: number; username: string; email: string; role: string; is_admin: boolean } = {
    username: '',
    email: '',
    role: 'farmer',
    is_admin: false
  };

  constructor(
    private apiService: ApiService,
    private alertController: AlertController,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.apiService.getAllUsers().subscribe({
      next: (data) => {
        // Trier les utilisateurs par nom en ordre alphabétique
        this.users = data.sort((a, b) => a.username.localeCompare(b.username));
        this.filteredUsers = [...this.users]; // Initialiser la liste filtrée
        this.updatePagination(); // Mettre à jour la pagination
      },
      error: (error) => console.error('Erreur lors de la récupération des utilisateurs:', error)
    });
  }

  // Filtrer les utilisateurs selon la recherche
  filterUsers() {
    const query = this.searchQuery.toLowerCase();
    this.filteredUsers = this.users.filter(user =>
      user.username.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
    );
    this.currentPage = 1; // Réinitialiser à la première page après recherche
    this.updatePagination();
  }

  // Mettre à jour la liste paginée
  updatePagination() {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.paginatedUsers = this.filteredUsers.slice(startIndex, endIndex);
    this.totalPages = Math.ceil(this.filteredUsers.length / this.pageSize) || 1;
  }

  // Aller à la page précédente
  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  // Aller à la page suivante
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  async addUser() {
    this.isAdding = true;
  }

  async saveNewUser() {
    this.apiService.createUser(this.newUser).subscribe({
      next: async () => {
        this.isAdding = false;
        this.newUser = { username: '', email: '', password: '', role: 'farmer', is_admin: false };
        this.loadUsers();
        await this.presentAlert('Succès', 'Utilisateur créé avec succès.');
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la création.');
      }
    });
  }

  async editUser(user: any) {
    this.isEditing = true;
    this.editedUser = { id: user.id, username: user.username, email: user.email, role: user.role, is_admin: user.is_admin };
  }

  async saveEditedUser() {
    if (!this.editedUser.id) return;
    this.apiService.updateUser(this.editedUser.id, {
      username: this.editedUser.username,
      email: this.editedUser.email,
      role: this.editedUser.role,
      is_admin: this.editedUser.is_admin
    }).subscribe({
      next: async () => {
        this.isEditing = false;
        this.editedUser = { username: '', email: '', role: 'farmer', is_admin: false };
        this.loadUsers();
        await this.presentAlert('Succès', 'Utilisateur mis à jour avec succès.');
      },
      error: async (error) => {
        await this.presentAlert('Erreur', error.message || 'Erreur lors de la mise à jour.');
      }
    });
  }

  async deleteUser(userId: number) {
    const alert = await this.alertController.create({
      header: 'Confirmer la suppression',
      message: 'Êtes-vous sûr de vouloir supprimer cet utilisateur ?',
      buttons: [
        {
          text: 'Annuler',
          role: 'cancel'
        },
        {
          text: 'Supprimer',
          handler: () => {
            this.apiService.deleteUser(userId).subscribe({
              next: async () => {
                this.loadUsers();
                await this.presentAlert('Succès', 'Utilisateur supprimé avec succès.');
              },
              error: async (error) => {
                await this.presentAlert('Erreur', error.message || 'Erreur lors de la suppression.');
              }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  cancelAdd() {
    this.isAdding = false;
    this.newUser = { username: '', email: '', password: '', role: 'farmer', is_admin: false };
  }

  cancelEdit() {
    this.isEditing = false;
    this.editedUser = { username: '', email: '', role: 'farmer', is_admin: false };
  }

  async presentAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }

  navigateTo(page: string) {
    this.router.navigate([`/tabs/${page}`]);
  }

  navigateToAdmin() {
    this.router.navigate(['/admin']);
  }
}