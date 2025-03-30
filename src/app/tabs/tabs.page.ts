import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { IonicModule, IonTabs } from '@ionic/angular';
import { Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class TabsPage implements OnInit, OnDestroy {
  @ViewChild('tabs', { static: false }) tabs!: IonTabs;
  showTabBar: boolean = true;
  private routerSubscription!: Subscription;

  // Liste des onglets avec leurs propriétés
  tabsList = [
    { tab: 'home', icon: 'home', label: 'Home', color: '#4CAF50' },       // Vert
    { tab: 'live', icon: 'videocam', label: 'Live', color: '#e91e63' },   // Rose
    { tab: 'detection', icon: 'camera', label: 'Detector', color: '#2196f3' }, // Bleu
    { tab: 'experts', icon: 'people', label: 'Expert', color: '#ff9800' }, // Orange
    { tab: 'weather', icon: 'cloud', label: 'Météo', color: '#03a9f4' },  // Bleu clair
    { tab: 'chatbot', icon: 'chatbubbles', label: 'AgriBot', color: '#9c27b0' }, // Violet
    { tab: 'profile', icon: 'person', label: 'Profil', color: '#673ab7' }  // Violet profond
  ];

  constructor(private router: Router) {}

  ngOnInit() {
    this.routerSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects;
      console.log('Current URL:', url);
      this.showTabBar = true;
    });
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }
}