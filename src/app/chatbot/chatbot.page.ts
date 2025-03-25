import { Component, OnInit } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, ChatHistory, ChatResponse } from '../services/api.service'; // Importer les interfaces nécessaires
import { Router } from '@angular/router';
import { ToastController, MenuController } from '@ionic/angular';

// Interface pour les messages dans le frontend
interface ChatMessage {
  id?: number;
  user: string;
  bot: string;
  isEditing?: boolean;
}

// Interface pour la réponse du backend (createConversation)
interface BackendConversation {
  id: string;
}

// Interface pour les conversations dans le frontend
interface Conversation {
  id: string;
  messages: ChatMessage[];
}

@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.page.html',
  styleUrls: ['./chatbot.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ChatbotPage implements OnInit {
  message: string = '';
  messages: ChatMessage[] = [];
  conversations: Conversation[] = [];
  currentConversationIndex: number = -1;
  currentConversationId: string | null = null;

  constructor(
    private apiService: ApiService,
    private router: Router,
    private toastController: ToastController,
    private menuController: MenuController,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.loadConversations();
  }

  loadConversations() {
    this.apiService.getConversations().subscribe({
      next: (chatHistories: ChatHistory[]) => {
        // Mapper ChatHistory[] vers Conversation[]
        this.conversations = chatHistories.map(conv => ({
          id: conv.conversation_id, // Renommer conversation_id en id
          messages: (conv.messages || []).map((msg: any) => ({
            id: msg.id,
            user: msg.message,
            bot: msg.response,
            isEditing: false
          }))
        }));
        if (this.conversations.length > 0) {
          this.currentConversationIndex = 0;
          this.currentConversationId = this.conversations[0].id;
          this.messages = this.conversations[0].messages;
        } else {
          this.newConversation();
        }
      },
      error: (error: any) => {
        console.error('Erreur lors du chargement des conversations:', error);
        if (error.message === 'Session expirée, veuillez vous reconnecter.') {
          this.router.navigate(['/login']);
        } else {
          this.newConversation();
        }
      }
    });
  }

  onInput(event: any) {
    const value = event.target.value;
    this.message = value !== null && value !== undefined ? String(value) : '';
  }

  async sendMessage() {
    if (!this.currentConversationId) {
      console.error('Aucune conversation sélectionnée.');
      return;
    }

    if (this.message.trim()) {
      console.log('Envoi du message:', this.message);
      const userMessage = this.message;
      this.messages.push({ user: userMessage, bot: '', isEditing: false });
      this.message = '';
      await this.fetchBotResponse(userMessage, this.messages.length - 1);
      this.conversations[this.currentConversationIndex].messages = this.messages;
    } else {
      console.log('Message vide, envoi annulé');
    }
  }

  async fetchBotResponse(userMessage: string, index: number) {
    if (!this.currentConversationId) {
      console.error('Aucune conversation sélectionnée.');
      this.messages[index].bot = 'Erreur : aucune conversation sélectionnée.';
      return;
    }

    try {
      const response = await this.apiService.sendChatMessage(userMessage, this.currentConversationId).toPromise();
      console.log('Réponse reçue:', response);
      if (response && response.response) {
        this.messages[index].bot = response.response;
      } else {
        console.error('Réponse non définie ou invalide:', response);
        this.messages[index].bot = 'Erreur: Réponse non disponible';
      }
      // Note : L'ID du message n'est pas renvoyé par /chat/send, il faudrait le récupérer via une autre requête si nécessaire
    } catch (error: any) {
      console.error('Erreur lors de l’envoi du message au chatbot:', error);
      if (error.message === 'Session expirée, veuillez vous reconnecter.') {
        this.router.navigate(['/login']);
      } else {
        this.messages[index].bot = error.message || 'Erreur lors de la communication avec le chatbot.';
      }
    }
  }

  async clearHistory() {
    const alert = await this.alertController.create({
      header: 'Confirmation',
      message: 'Voulez-vous vraiment supprimer tous les messages de cette conversation ?',
      buttons: [
        {
          text: 'Annuler',
          role: 'cancel'
        },
        {
          text: 'Supprimer',
          handler: () => {
            if (this.currentConversationId) {
              this.apiService.deleteConversation(this.currentConversationId).subscribe({
                next: () => {
                  this.loadConversations();
                },
                error: (error: any) => {
                  console.error('Erreur lors de la suppression de la conversation:', error);
                  if (error.message === 'Session expirée, veuillez vous reconnecter.') {
                    this.router.navigate(['/login']);
                  }
                }
              });
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteMessage(index: number) {
    const message = this.messages[index];
    if (!message.id) {
      console.error('ID du message manquant.');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirmation',
      message: 'Voulez-vous supprimer ce message ?',
      buttons: [
        {
          text: 'Annuler',
          role: 'cancel'
        },
        {
          text: 'Supprimer',
          handler: () => {
            this.apiService.deleteMessage(message.id!).subscribe({
              next: () => {
                this.messages.splice(index, 1);
                this.conversations[this.currentConversationIndex].messages = this.messages;
              },
              error: (error: any) => {
                console.error('Erreur lors de la suppression du message:', error);
                if (error.message === 'Session expirée, veuillez vous reconnecter.') {
                  this.router.navigate(['/login']);
                }
              }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  editMessage(index: number) {
    this.messages[index].isEditing = true;
  }

  stopEditing(index: number) {
    const message = this.messages[index];
    if (!message.id) {
      console.error('ID du message manquant.');
      return;
    }

    this.messages[index].isEditing = false;
    this.apiService.updateMessage(message.id, message.user).subscribe({
      next: () => {
        this.conversations[this.currentConversationIndex].messages = this.messages;
        // Recharger les messages pour obtenir la nouvelle réponse du bot
        this.loadConversations();
      },
      error: (error: any) => {
        console.error('Erreur lors de la mise à jour du message:', error);
        if (error.message === 'Session expirée, veuillez vous reconnecter.') {
          this.router.navigate(['/login']);
        }
      }
    });
  }

  async reloadBotMessage(index: number) {
    const userMessage = this.messages[index].user;
    this.messages[index].bot = 'Chargement...';
    await this.fetchBotResponse(userMessage, index);
    this.conversations[this.currentConversationIndex].messages = this.messages;
  }

  async copyBotMessage(index: number) {
    const botMessage = this.messages[index].bot;
    try {
      await navigator.clipboard.writeText(botMessage);
      const toast = await this.toastController.create({
        message: 'Message copié dans le presse-papiers !',
        duration: 2000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();
    } catch (error) {
      console.error('Erreur lors de la copie du message:', error);
      const toast = await this.toastController.create({
        message: 'Erreur lors de la copie du message.',
        duration: 2000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    }
  }

  newConversation() {
    this.apiService.createConversation().subscribe({
      next: (newConv: BackendConversation) => {
        // Mapper BackendConversation vers Conversation
        const conversation: Conversation = {
          id: newConv.id,
          messages: []
        };
        this.conversations.push(conversation);
        this.currentConversationIndex = this.conversations.length - 1;
        this.currentConversationId = newConv.id;
        this.messages = this.conversations[this.currentConversationIndex].messages;
        this.menuController.close('conversationMenu');
      },
      error: (error: any) => {
        console.error('Erreur lors de la création de la conversation:', error);
        if (error.message === 'Session expirée, veuillez vous reconnecter.') {
          this.router.navigate(['/login']);
        }
      }
    });
  }

  selectConversation(index: number) {
    this.currentConversationIndex = index;
    this.currentConversationId = this.conversations[index].id;
    this.messages = this.conversations[index].messages;
    this.menuController.close('conversationMenu');
  }

  async deleteConversation(index: number) {
    const alert = await this.alertController.create({
      header: 'Confirmation',
      message: 'Voulez-vous vraiment supprimer cette conversation ?',
      buttons: [
        {
          text: 'Annuler',
          role: 'cancel'
        },
        {
          text: 'Supprimer',
          handler: () => {
            const conversationId = this.conversations[index].id;
            this.apiService.deleteConversation(conversationId).subscribe({
              next: () => {
                this.conversations.splice(index, 1);
                if (this.conversations.length === 0) {
                  this.newConversation();
                } else {
                  this.currentConversationIndex = Math.min(index, this.conversations.length - 1);
                  this.currentConversationId = this.conversations[this.currentConversationIndex].id;
                  this.messages = this.conversations[this.currentConversationIndex].messages;
                }
              },
              error: (error: any) => {
                console.error('Erreur lors de la suppression de la conversation:', error);
                if (error.message === 'Session expirée, veuillez vous reconnecter.') {
                  this.router.navigate(['/login']);
                }
              }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  saveConversations() {
    // Plus besoin de sauvegarder dans localStorage, tout est géré côté serveur
  }
}