import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PwaService } from '../../services/pwa.service';
import Swal from 'sweetalert2';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidenav.component.html',
  styleUrl: './sidenav.component.css',
})
export class SidenavComponent implements OnInit, OnDestroy {
  isModalOpen = false;
  canInstall = false;
  isInstalled = false;
  ordersAttentionCount = 0;
  volunteersBadgeCount = 0;
  menuBadgeCount = 0;
  private pendingVolunteerApplications = 0;
  private assignedVolunteerOrders = 0;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private readonly apiUrl = environment.apiUrl;

  navItems = [
    {
      path: '/staff/staff-dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
    },
    { path: '/staff/orders', label: 'Order Management', icon: 'shopping_cart' },
    { path: '/staff/volunteers', label: 'Volunteers/Delivery', icon: 'people' },
    { path: '/staff/menu', label: 'Menu Management', icon: 'restaurant_menu' },
    {
      path: '/staff/user-management',
      label: 'User Management',
      icon: 'manage_accounts',
    },
    { path: '/staff/logs', label: 'Audit Logs', icon: 'history' },
  ];

  private ordersEventListener = (event: Event) => {
    const detail = (event as CustomEvent<{
      attentionCount?: number;
      assignedOrders?: number;
    }>).detail;

    if (detail) {
      if (detail.attentionCount !== undefined) {
        this.ordersAttentionCount = Math.max(0, detail.attentionCount);
      }
      if (detail.assignedOrders !== undefined) {
        this.assignedVolunteerOrders = Math.max(0, detail.assignedOrders);
      }
      this.updateVolunteersBadgeCount();
    } else {
      this.fetchOrdersData();
    }
  };

  private volunteersEventListener = (event: Event) => {
    const detail = (event as CustomEvent<{
      pendingApplications?: number;
      assignedOrders?: number;
    }>).detail;

    if (detail) {
      if (detail.pendingApplications !== undefined) {
        this.pendingVolunteerApplications = Math.max(
          0,
          detail.pendingApplications
        );
      }
      if (detail.assignedOrders !== undefined) {
        this.assignedVolunteerOrders = Math.max(0, detail.assignedOrders);
      }
      this.updateVolunteersBadgeCount();
    } else {
      this.fetchVolunteerApplications();
    }
  };

  private menuEventListener = (event: Event) => {
    const detail = (event as CustomEvent<{ lowStockCount?: number }>).detail;
    if (detail && detail.lowStockCount !== undefined) {
      this.menuBadgeCount = Math.max(0, detail.lowStockCount);
    } else {
      this.fetchMenuLowStock();
    }
  };

  constructor(private pwaService: PwaService, private http: HttpClient) {}

  ngOnInit(): void {
    this.initializePwa();
    this.registerEventListeners();
    this.refreshAllIndicators();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.removeEventListeners();
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
      return 'Install App';
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

  // Get the first 4 items for mobile display
  get visibleNavItems() {
    return this.navItems.slice(0, 4);
  }

  // Get remaining items for modal display
  get hiddenNavItems() {
    return this.navItems.slice(4);
  }

  // Check if we need to show the "More" button
  get shouldShowMoreButton() {
    return this.navItems.length > 4;
  }

  openModal() {
    this.isModalOpen = true;
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    this.isModalOpen = false;
    // Restore body scroll
    document.body.style.overflow = 'auto';
  }

  onNavItemClick() {
    // Close modal when a navigation item is clicked
    this.closeModal();
  }

  get hasOrdersAttention(): boolean {
    return this.ordersAttentionCount > 0;
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      this.refreshAllIndicators();
    }, 60000);
  }

  private refreshAllIndicators(): void {
    this.fetchOrdersData();
    this.fetchVolunteerApplications();
    this.fetchMenuLowStock();
  }

  private getStaffToken(): string | null {
    return (
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken')
    );
  }

  private authHeaders(): { [key: string]: string } | undefined {
    const token = this.getStaffToken();
    if (!token) {
      return undefined;
    }
    return { Authorization: `Bearer ${token}` };
  }

  private fetchOrdersData(): void {
    const headers = this.authHeaders();
    if (!headers) {
      this.ordersAttentionCount = 0;
      this.assignedVolunteerOrders = 0;
      this.updateVolunteersBadgeCount();
      return;
    }

    this.http
      .get<any[]>(`${this.apiUrl}/orders`, { headers })
      .subscribe({
        next: (orders) => {
          const list = Array.isArray(orders) ? orders : [];
          const trackedStatuses = ['pending', 'preparing', 'ready', 'on_delivery'];
          this.ordersAttentionCount = list.filter((order) => {
            const status = (order?.status || '').toString().trim().toLowerCase();
            return trackedStatuses.includes(status);
          }).length;

          this.assignedVolunteerOrders = list.filter((order) => {
            const status = (order?.status || '')
              .toString()
              .trim()
              .toLowerCase();
            return (
              order?.delivery_option === 'delivery' &&
              ['ready', 'on_delivery'].includes(status) &&
              !!order?.volunteer_id
            );
          }).length;

          this.updateVolunteersBadgeCount();
        },
        error: (err) => {
          console.error('Failed to fetch orders summary:', err);
          this.ordersAttentionCount = 0;
          this.assignedVolunteerOrders = 0;
          this.updateVolunteersBadgeCount();
        },
      });
  }

  private fetchVolunteerApplications(): void {
    const headers = this.authHeaders();
    if (!headers) {
      this.pendingVolunteerApplications = 0;
      this.updateVolunteersBadgeCount();
      return;
    }

    this.http
      .get<any[]>(`${this.apiUrl}/volunteers/applications`, { headers })
      .subscribe({
        next: (applications) => {
          const list = Array.isArray(applications) ? applications : [];
          this.pendingVolunteerApplications = list.filter(
            (app) => (app?.status || '').toLowerCase() === 'pending'
          ).length;
          this.updateVolunteersBadgeCount();
        },
        error: (err) => {
          console.error('Failed to fetch volunteer applications:', err);
          this.pendingVolunteerApplications = 0;
          this.updateVolunteersBadgeCount();
        },
      });
  }

  private fetchMenuLowStock(): void {
    const headers = this.authHeaders();
    const options = headers ? { headers } : {};

    this.http
      .get<any[]>(`${this.apiUrl}/menu/products`, options)
      .subscribe({
        next: (products) => {
          const list = Array.isArray(products) ? products : [];
          this.menuBadgeCount = list.filter((product) => {
            const stock = Number(product?.stock ?? 0);
            return !isNaN(stock) && stock <= 10;
          }).length;
        },
        error: (err) => {
          console.error('Failed to fetch menu inventory summary:', err);
          this.menuBadgeCount = 0;
        },
      });
  }

  private registerEventListeners(): void {
    window.addEventListener(
      'staff-orders-updated',
      this.ordersEventListener as EventListener
    );
    window.addEventListener(
      'staff-volunteers-updated',
      this.volunteersEventListener as EventListener
    );
    window.addEventListener(
      'staff-menu-updated',
      this.menuEventListener as EventListener
    );
  }

  private removeEventListeners(): void {
    window.removeEventListener(
      'staff-orders-updated',
      this.ordersEventListener as EventListener
    );
    window.removeEventListener(
      'staff-volunteers-updated',
      this.volunteersEventListener as EventListener
    );
    window.removeEventListener(
      'staff-menu-updated',
      this.menuEventListener as EventListener
    );
  }

  private updateVolunteersBadgeCount(): void {
    this.volunteersBadgeCount =
      this.pendingVolunteerApplications + this.assignedVolunteerOrders;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.isModalOpen) {
      this.closeModal();
    }
  }
}
