import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewsService } from '../../services/views.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-footer-hero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer-hero.component.html',
  styleUrl: './footer-hero.component.css'
})
export class FooterHeroComponent implements OnInit, OnDestroy {
  viewCount: number = 0;
  private subscription?: Subscription;

  constructor(private viewsService: ViewsService) {}

  ngOnInit(): void {
    // Subscribe to view count updates
    this.subscription = this.viewsService.viewCount$.subscribe((count) => {
      this.viewCount = count;
    });

    // Fetch initial view count
    this.viewsService.getViewCount().subscribe();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
