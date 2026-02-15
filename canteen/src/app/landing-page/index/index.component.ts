import { Component, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { TopnavHeroComponent } from '../../components/topnav-hero/topnav-hero.component';
import { FooterHeroComponent } from '../../components/footer-hero/footer-hero.component';
import { PwaService } from '../../services/pwa.service';
import { ViewsService } from '../../services/views.service';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-index',
  standalone: true,
  imports: [RouterLink, TopnavHeroComponent, FooterHeroComponent, CommonModule],
  templateUrl: './index.component.html',
  styleUrl: './index.component.css',
})
export class IndexComponent implements OnInit {
  canInstall = false;
  isInstalled = false;

  constructor(
    private router: Router,
    private pwaService: PwaService,
    private viewsService: ViewsService
  ) {}

  ngOnInit(): void {
    this.initializePwa();
    this.recordPageView();
  }

  recordPageView(): void {
    this.viewsService.recordView().subscribe({
      next: (count) => {
        console.log('Page view recorded. Total views:', count);
      },
      error: (error) => {
        console.error('Failed to record page view:', error);
      },
    });
  }

  initializePwa(): void {
    // Subscribe to PWA installable state
    this.pwaService.installable$.subscribe((installable) => {
      this.canInstall = installable;
      this.isInstalled = this.pwaService.isInstalled();
    });

    // Check if app is already installed
    this.isInstalled = this.pwaService.isInstalled();
  }

  async installApp(): Promise<void> {
    if (this.isInstalled) {
      Swal.fire({
        icon: 'info',
        title: 'Already Installed',
        html: 'The app is already installed on your device.<br>You can access it from your home screen or app drawer.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
      return;
    }

    if (!this.canInstall) {
      Swal.fire({
        icon: 'info',
        title: 'Already Installed',
        html: 'The app is already installed on your device.<br>You can access it from your home screen or app drawer.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
      return;
    }

    try {
      const installed = await this.pwaService.installApp();

      if (installed) {
        Swal.fire({
          icon: 'success',
          title: 'App Installed!',
          text: 'HotBite has been successfully installed on your device.',
          confirmButtonText: 'Great!',
          confirmButtonColor: '#52796f',
        });
        this.isInstalled = true;
        this.canInstall = false;
      } else {
        Swal.fire({
          icon: 'info',
          title: 'Installation Cancelled',
          text: 'You can install the app later from your browser menu.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#52796f',
        });
      }
    } catch (error) {
      console.error('Installation error:', error);
      Swal.fire({
        icon: 'error',
        title: 'Installation Failed',
        text: 'Failed to install the app. Please try again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
    }
  }

  getInstallButtonText(): string {
    if (this.isInstalled) {
      return 'App Already Installed';
    }
    if (this.canInstall) {
      return 'Install HotBite App';
    }
    return 'Install Not Available';
  }

  getInstallButtonIcon(): string {
    if (this.isInstalled) {
      return 'check_circle';
    }
    if (this.canInstall) {
      return 'get_app';
    }
    return 'info';
  }

  login() {
    this.router.navigate(['/login/staff']);
  }
}
