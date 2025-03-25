import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { AdminPage } from './admin.page';
import { AdminPageRoutingModule } from './admin-routing.module';

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    AdminPageRoutingModule,
    AdminPage // Importer le composant standalone
  ]
  // Pas de declarations
})
export class AdminPageModule {}