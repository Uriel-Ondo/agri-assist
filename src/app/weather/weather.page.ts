import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-weather',
  templateUrl: './weather.page.html',
  styleUrls: ['./weather.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class WeatherPage implements OnInit {
  weatherData: any = null;
  searchCity: string = 'Dakar';
  favoriteCities: string[] = [];
  favoriteWeatherData: { [key: string]: any } = {};

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.weatherData = {
      city: this.searchCity,
      country: '',
      temperature: 0,
      conditions: 'Chargement...',
      humidity: 0,
      windSpeed: 0,
      sunrise: 'N/A',
      sunset: 'N/A',
      date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    };
    this.getCurrentLocationWeather();
    this.loadFavoriteCities();
  }

  getCurrentLocationWeather() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          this.apiService.getWeatherByCoords(lat, lon).subscribe({
            next: (data: any) => {
              this.updateWeatherData(data);
            },
            error: (error) => {
              console.error('Erreur lors de la récupération de la météo par coordonnées:', error);
              this.loadWeather(this.searchCity);
            }
          });
        },
        (error) => {
          console.error('Erreur lors de la récupération de la localisation:', error);
          this.loadWeather(this.searchCity);
        }
      );
    } else {
      console.error('La géolocalisation n\'est pas supportée par ce navigateur.');
      this.loadWeather(this.searchCity);
    }
  }

  searchWeather() {
    if (this.searchCity.trim() === '') return;
    this.loadWeather(this.searchCity);
  }

  loadWeather(city: string) {
    this.apiService.getWeather(city).subscribe({
      next: (data: any) => {
        this.updateWeatherData(data);
      },
      error: (error) => {
        console.error('Erreur lors de la récupération de la météo:', error);
        this.weatherData = null;
      }
    });
  }

  updateWeatherData(data: any) {
    this.weatherData = {
      city: data.city,
      country: data.country,
      temperature: data.temperature,
      conditions: data.description,
      humidity: data.humidity,
      windSpeed: data.wind_speed,
      sunrise: data.sunrise, // Format déjà en HH:MM depuis le backend
      sunset: data.sunset,   // Format déjà en HH:MM depuis le backend
      date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    };
    this.searchCity = data.city;
  }

  loadFavoriteCitiesWeather() {
    this.favoriteCities.forEach(city => {
      this.apiService.getWeather(city).subscribe({
        next: (data: any) => {
          this.favoriteWeatherData[city] = {
            temperature: data.temperature,
            conditions: data.description
          };
        },
        error: (error) => {
          console.error(`Erreur lors de la récupération de la météo pour ${city}:`, error);
        }
      });
    });
  }
  addFavoriteCity() {
    if (!this.favoriteCities || !Array.isArray(this.favoriteCities)) {
      this.favoriteCities = [];
    }
    if (!this.favoriteCities.includes(this.searchCity)) {
      this.apiService.addFavoriteCity(this.searchCity).subscribe({
        next: () => {
          this.favoriteCities.push(this.searchCity);
          this.loadFavoriteCitiesWeather();
        },
        error: (error) => {
          console.error('Erreur lors de l\'ajout de la ville favorite:', error);
        }
      });
    }
  }
  
  loadFavoriteCities() {
    this.apiService.getFavoriteCities().subscribe({
      next: (data) => {
        console.log('Favorite cities from API:', data.favorite_cities);
        this.favoriteCities = data.favorite_cities || [];
        this.loadFavoriteCitiesWeather();
      },
      error: (error) => {
        console.error('Erreur lors de la récupération des villes favorites:', error);
        this.favoriteCities = [];
      }
    });
  }

  removeCity(city: string) {
    this.apiService.removeFavoriteCity(city).subscribe({
      next: () => {
        this.favoriteCities = this.favoriteCities.filter(c => c !== city);
        delete this.favoriteWeatherData[city];
      },
      error: (error) => {
        console.error('Erreur lors de la suppression de la ville favorite:', error);
      }
    });
  }

  getWeatherIcon(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes('clear')) return 'sunny';
    if (desc.includes('cloud')) return 'cloudy';
    if (desc.includes('rain')) return 'rainy';
    if (desc.includes('storm')) return 'thunderstorm';
    if (desc.includes('snow')) return 'snow';
    return 'cloud';
  }

  getBackgroundClass(): string {
    if (!this.weatherData || !this.weatherData.conditions) return 'default-background';
    const desc = this.weatherData.conditions.toLowerCase();
    if (desc.includes('clear')) return 'clear-background';
    if (desc.includes('cloud')) return 'cloudy-background';
    if (desc.includes('rain')) return 'rainy-background';
    if (desc.includes('storm')) return 'stormy-background';
    if (desc.includes('snow')) return 'snowy-background';
    return 'default-background';
  }
}