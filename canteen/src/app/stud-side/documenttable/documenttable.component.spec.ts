/// <reference types="jasmine" />

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumenttableComponent } from './documenttable.component';

describe('DocumenttableComponent', () => {
  let component: DocumenttableComponent;
  let fixture: ComponentFixture<DocumenttableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumenttableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocumenttableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
