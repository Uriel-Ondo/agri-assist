import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetectionPage } from './detection.page';

describe('DetectionPage', () => {
  let component: DetectionPage;
  let fixture: ComponentFixture<DetectionPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(DetectionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
