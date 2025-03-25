import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExpertsPage } from './experts.page';

describe('ExpertsPage', () => {
  let component: ExpertsPage;
  let fixture: ComponentFixture<ExpertsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ExpertsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
