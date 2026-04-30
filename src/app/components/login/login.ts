import { Component, OnDestroy } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  imports: [NgOptimizedImage],
  templateUrl: './login.html',
  styleUrl: './login.css',
  host: {
    class: 'login-page',
  },
})
export class Login implements OnDestroy {
  roleLabel = 'User';
  private readonly subscriptions = new Subscription();

  constructor(private readonly router: Router) {
    this.updateRoleFromUrl(this.router.url);

    this.subscriptions.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => this.updateRoleFromUrl(event.urlAfterRedirects)),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private updateRoleFromUrl(url: string): void {
    const path = url.split('?')[0].split('#')[0];

    if (path.startsWith('/admin')) {
      this.roleLabel = 'Principal';
      return;
    }

    if (path.startsWith('/teacher')) {
      this.roleLabel = 'Teacher';
      return;
    }

    if (path.startsWith('/coard')) {
      this.roleLabel = 'Coord';
      return;
    }

    if (path.startsWith('/master')) {
      this.roleLabel = 'Master';
      return;
    }

    this.roleLabel = 'User';
  }
}
