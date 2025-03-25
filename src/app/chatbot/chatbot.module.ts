import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ChatbotPage } from './chatbot.page';
import { ChatbotPageRoutingModule } from './chatbot-routing.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ChatbotPageRoutingModule,
    ChatbotPage // Ajouter ici
  ],
  // Supprimer declarations
})
export class ChatbotPageModule {}