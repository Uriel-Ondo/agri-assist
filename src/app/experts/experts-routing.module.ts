import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ExpertsPage } from './experts.page';

const routes: Routes = [
  {
    path: '',
    component: ExpertsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExpertsPageRoutingModule {}