import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  private deferredPrompt: any;
  private installableSubject = new BehaviorSubject<boolean>(false);
  public installable$ = this.installableSubject.asObservable();

  constructor() {
    this.initializePwa();
  }

  private initializePwa(): void {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('PWA: beforeinstallprompt event fired');
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      this.deferredPrompt = e;
      // Update the installable state
      this.installableSubject.next(true);
    });

    // Listen for the appinstalled event
    window.addEventListener('appinstalled', () => {
      console.log('PWA: App was installed');
      this.deferredPrompt = null;
      this.installableSubject.next(false);
    });

    // Check if the app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('PWA: App is already installed');
      this.installableSubject.next(false);
    }
  }

  public async installApp(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('PWA: No install prompt available');
      return false;
    }

    try {
      // Show the install prompt
      this.deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await this.deferredPrompt.userChoice;

      console.log(`PWA: User response to install prompt: ${outcome}`);

      // Clear the deferred prompt
      this.deferredPrompt = null;
      this.installableSubject.next(false);

      return outcome === 'accepted';
    } catch (error) {
      console.error('PWA: Error during installation:', error);
      return false;
    }
  }

  public isInstallable(): boolean {
    return this.installableSubject.value;
  }

  public isInstalled(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  }

  public isOnline(): boolean {
    return navigator.onLine;
  }

  public getInstallButtonText(): string {
    if (this.isInstalled()) {
      return 'App Installed';
    }
    return 'Install App';
  }

  public getInstallButtonIcon(): string {
    if (this.isInstalled()) {
      return 'check_circle';
    }
    return 'get_app';
  }

  public canInstall(): boolean {
    return this.isInstallable() && !this.isInstalled();
  }
}
