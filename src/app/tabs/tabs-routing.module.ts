import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadChildren: () => import('../home/home.module').then(m => m.HomePageModule)
      },
      {
        path: 'live',
        loadChildren: () => import('../live/live.module').then(m => m.LivePageModule)
      },
      {
        path: 'detection',
        loadChildren: () => import('../detection/detection.module').then(m => m.DetectionPageModule)
      },
      {
        path: 'experts',
        loadChildren: () => import('../experts/experts.module').then(m => m.ExpertsPageModule)
      },
      {
        path: 'weather',
        loadChildren: () => import('../weather/weather.module').then(m => m.WeatherPageModule)
      },
      {
        path: 'chatbot',
        loadChildren: () => import('../chatbot/chatbot.module').then(m => m.ChatbotPageModule)
      },
      {
        path: 'profile',
        loadChildren: () => import('../profile/profile.module').then(m => m.ProfilePageModule)
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule {}