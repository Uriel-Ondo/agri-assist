import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ExpertsPage } from './experts.page';
import { ExpertsPageRoutingModule } from './experts-routing.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    ExpertsPageRoutingModule,
    ExpertsPage // Importer le composant standalone
  ]
  // Pas de declarations
})
export class ExpertsPageModule {}