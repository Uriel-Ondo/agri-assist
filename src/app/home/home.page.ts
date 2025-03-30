import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class HomePage {
  sections = [
    { title: 'Live', icon: 'videocam', route: 'live', description: 'Accéder à la section LIVE', color: '#e91e63' },
    { title: 'AgriBot', icon: 'chatbubbles', route: 'chatbot', description: 'Parler avec le AgriBot', color: '#2196f3' },
    { title: 'Detector', icon: 'leaf', route: 'detection', description: 'Détection des maladies des plantes', color: '#4CAF50' },
    { title: 'Expert', icon: 'people', route: 'experts', description: 'Consulter un expert', color: '#ff9800' },
    { title: 'Météo', icon: 'cloudy', route: 'weather', description: 'Vérifier la météo', color: '#03a9f4' },
    { title: 'Profil', icon: 'person', route: 'profile', description: 'Voir mon profil', color: '#9c27b0' }
  ];

  constructor(private router: Router) {}

  navigateTo(page: string) {
    this.router.navigate([`/tabs/${page}`]);
  }
}