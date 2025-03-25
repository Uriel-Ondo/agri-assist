import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { DetectionPage } from './detection.page';
import { DetectionPageRoutingModule } from './detection-routing.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    DetectionPageRoutingModule,
    DetectionPage // Ajouter ici
  ],
  // Supprimer declarations
})
export class DetectionPageModule {}