import { Component } from '@angular/core';
import { TopnavHeroComponent } from '../../components/topnav-hero/topnav-hero.component';
import { FooterHeroComponent } from '../../components/footer-hero/footer-hero.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [TopnavHeroComponent, FooterHeroComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {}
