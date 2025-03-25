import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { Camera, CameraResultType } from '@capacitor/camera';

@Component({
  selector: 'app-detection',
  templateUrl: './detection.page.html',
  styleUrls: ['./detection.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class DetectionPage implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  file: File | null = null;
  result: any = null;
  image: string | undefined;

  constructor(private apiService: ApiService) {}

  ngOnInit() {}

  async takePicture() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
      });
      this.image = image.dataUrl;

      // Convertir Data URL en File pour l'API
      const blob = await fetch(image.dataUrl!).then((res) => res.blob());
      this.file = new File([blob], 'plant_image.jpg', { type: 'image/jpeg' });
    } catch (error) {
      console.error('Erreur lors de la prise de photo :', error);
    }
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => (this.image = reader.result as string);
      reader.readAsDataURL(this.file);
    }
  }
  detect() {
    if (this.file) {
      this.apiService.detectPlantDisease(this.file).subscribe({
        next: (response: any) => {
          this.result = response;
        },
        error: (error: any) => {
          console.error('Erreur lors de la détection :', error.message);
        }
      });
    } else {
      console.error('Aucun fichier sélectionné pour la détection.');
    }
  }
}