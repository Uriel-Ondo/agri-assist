import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { LivePage } from './live.page';
import { LivePageRoutingModule } from './live-routing.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    LivePageRoutingModule,
    LivePage // Ajouter ici
  ],
  // Supprimer declarations
})
export class LivePageModule {}