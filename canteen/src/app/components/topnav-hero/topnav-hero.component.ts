import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-topnav-hero',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './topnav-hero.component.html',
  styleUrl: './topnav-hero.component.css',
})
export class TopnavHeroComponent {}
