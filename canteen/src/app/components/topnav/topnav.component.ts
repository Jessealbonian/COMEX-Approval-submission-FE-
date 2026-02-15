import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-topnav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topnav.component.html',
  styleUrl: './topnav.component.css',
})
export class TopnavComponent implements OnInit, OnDestroy {
  isDropdownOpen = false;
  username: string = 'Guest';
  isVolunteer = false;
  isAvailable = false;
  pendingOrdersCount = 0;
  cartItemCount = 0;
  volunteerAssignmentsCount = 0;
  apiUrl = environment.apiUrl;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private offerPollTimer?: ReturnType<typeof setInterval>;
  private activeOfferId?: number;
  private isOfferModalOpen = false;
  private isRespondingOffer = false;

  private cartUpdateListener = (event: Event) => {
    const detail = (event as CustomEvent<{ count?: number }>).detail;
    if (detail && typeof detail.count === 'number') {
      this.cartItemCount = detail.count;
    } else {
      this.updateCartCountFromStorage();
    }
  };

  private ordersUpdateListener = () => {
    this.fetchPendingOrdersCount();
  };

  private volunteerAvailabilityListener = (event: Event): void => {
    const detail = (event as CustomEvent<{ isAvailable?: boolean }>).detail;
    if (detail && typeof detail.isAvailable === 'boolean') {
      this.isAvailable = detail.isAvailable;
    }
    this.handleAvailabilityChange(this.isAvailable);
  };

  private volunteerAssignmentsListener = (event: Event) => {
    const detail = (event as CustomEvent<{ count?: number }>).detail;
    if (
      this.isVolunteer &&
      this.isAvailable &&
      detail &&
      typeof detail.count === 'number'
    ) {
      this.volunteerAssignmentsCount = detail.count;
    } else {
      this.fetchVolunteerAssignments();
    }
  };

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const token =
      sessionStorage.getItem('student_token') ||
      localStorage.getItem('studentToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.username = payload.name || 'Guest';
        this.isVolunteer = payload.role === 'volunteer';

        // If user is a volunteer, check their availability
        if (this.isVolunteer) {
          this.checkVolunteerAvailability();
        }
      } catch (e) {
        console.error('Error decoding token:', e);
        this.username = 'Guest';
      }
    }

    this.updateCartCountFromStorage();
    this.fetchPendingOrdersCount();
    this.fetchVolunteerAssignments();
    if (this.isVolunteer && this.isAvailable) {
      this.startOfferPolling();
    }
    this.registerEventListeners();
    this.startAutoRefresh();
  }

  private checkVolunteerAvailability(): void {
    const token =
      sessionStorage.getItem('student_token') ||
      localStorage.getItem('studentToken');
    const headers = { Authorization: `Bearer ${token}` };

    this.http.get(`${this.apiUrl}/volunteers/me`, { headers }).subscribe({
      next: (res: any) => {
        this.isAvailable = res.is_available || false;
        this.handleAvailabilityChange(this.isAvailable);
      },
      error: (err) => {
        console.error('Failed to check volunteer availability:', err);
        this.isAvailable = false;
        this.handleAvailabilityChange(this.isAvailable);
      },
    });
  }

  // Public method to refresh availability (can be called from other components)
  public refreshAvailability(): void {
    if (this.isVolunteer) {
      this.checkVolunteerAvailability();
    }
  }

  private getStudentToken(): string | null {
    return (
      sessionStorage.getItem('student_token') ||
      localStorage.getItem('studentToken')
    );
  }

  private fetchPendingOrdersCount(): void {
    const token = this.getStudentToken();
    if (!token) {
      this.pendingOrdersCount = 0;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` } as any;
    this.http.get(`${this.apiUrl}/orders/my`, { headers }).subscribe({
      next: (orders: any) => {
        if (!Array.isArray(orders)) {
          this.pendingOrdersCount = 0;
          return;
        }

        const trackedStatuses = [
          'pending',
          'preparing',
          'ready',
          'on_delivery',
        ];
        this.pendingOrdersCount = orders.filter((order: any) => {
          const status = (order?.status || '').toString().trim().toLowerCase();
          return trackedStatuses.includes(status);
        }).length;
      },
      error: (err) => {
        console.error('Failed to fetch pending orders count', err);
        this.pendingOrdersCount = 0;
      },
    });
  }

  private updateCartCountFromStorage(): void {
    try {
      const raw = sessionStorage.getItem('student_cart');
      if (!raw) {
        this.cartItemCount = 0;
        return;
      }

      const cart = JSON.parse(raw);
      if (!Array.isArray(cart)) {
        this.cartItemCount = 0;
        return;
      }

      this.cartItemCount = cart.reduce(
        (total: number, item: any) => total + (Number(item?.quantity) || 0),
        0
      );
    } catch {
      this.cartItemCount = 0;
    }
  }

  private fetchVolunteerAssignments(): void {
    if (!this.isVolunteer || !this.isAvailable) {
      this.volunteerAssignmentsCount = 0;
      return;
    }

    const token = this.getStudentToken();
    if (!token) {
      this.volunteerAssignmentsCount = 0;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` } as any;
    this.http.get(`${this.apiUrl}/orders/for-delivery`, { headers }).subscribe({
      next: (orders: any) => {
        if (Array.isArray(orders)) {
          this.volunteerAssignmentsCount = orders.length;
        } else {
          this.volunteerAssignmentsCount = 0;
        }
      },
      error: (err) => {
        console.error('Failed to fetch volunteer assignments', err);
        this.volunteerAssignmentsCount = 0;
      },
    });
  }

  private startOfferPolling(): void {
    if (this.offerPollTimer) {
      clearInterval(this.offerPollTimer);
    }
    // poll immediately
    this.pollOfferOnce();
    this.offerPollTimer = setInterval(() => this.pollOfferOnce(), 5000);
  }

  private stopOfferPolling(): void {
    if (this.offerPollTimer) {
      clearInterval(this.offerPollTimer);
      this.offerPollTimer = undefined;
    }
  }

  private pollOfferOnce(): void {
    if (
      !this.isVolunteer ||
      !this.isAvailable ||
      this.isOfferModalOpen ||
      this.isRespondingOffer
    ) {
      return;
    }

    const token = this.getStudentToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` } as any;

    this.http
      .get(`${this.apiUrl}/volunteers/offers/mine`, { headers })
      .subscribe({
        next: (offer: any) => {
          if (offer && offer.offer_id) {
            if (this.activeOfferId !== offer.offer_id) {
              this.showOfferModal(offer);
            }
          } else {
            this.activeOfferId = undefined;
          }
        },
        error: (err) => console.error('Failed to check volunteer offers', err),
      });
  }

  private showOfferModal(offer: any): void {
    this.activeOfferId = offer.offer_id;
    this.isOfferModalOpen = true;

    const itemsHtml = (offer.items || [])
      .map(
        (it: any) =>
          `<li>${it.quantity}x ${it.product_name} - ₱${Number(
            it.price_each || 0
          ).toFixed(2)}</li>`
      )
      .join('');

    const preferredTime = offer.preferred_time
      ? this.formatTimeToAMPM(offer.preferred_time)
      : '—';
    const total = offer.summary?.total || 0;
    const deliveryRoom = offer.delivery_room || '—';

    Swal.fire({
      title: 'Delivery Task Offer',
      html: `
        <p>You have a delivery task offer.</p>
        <div style="text-align:left; line-height:1.4; margin-top:8px;">
          <p><strong>Order:</strong> #${offer.order_id}</p>
          <p><strong>Delivery Room:</strong> ${deliveryRoom}</p>
          <p><strong>Preferred Time:</strong> ${preferredTime}</p>
          <p><strong>Estimated Total:</strong> ₱${Number(total).toFixed(2)}</p>
          <p><strong>Items:</strong></p>
          <ul style="padding-left:18px; margin:0;">${
            itemsHtml || '<li>Items unavailable</li>'
          }</ul>
        </div>
      `,
      showConfirmButton: true,
      showDenyButton: true,
      confirmButtonText: 'Accept Delivery',
      denyButtonText: 'Decline',
      confirmButtonColor: '#52796f',
      denyButtonColor: '#d33',
      allowOutsideClick: false,
      allowEscapeKey: false,
    }).then((result) => {
      this.isOfferModalOpen = false;
      if (result.isConfirmed) {
        this.respondToOffer(offer.offer_id, 'accept');
      } else if (result.isDenied) {
        this.respondToOffer(offer.offer_id, 'decline');
      } else {
        // dismissed without action; allow future polling to re-open if needed
        this.activeOfferId = undefined;
      }
    });
  }

  private respondToOffer(offerId: number, action: 'accept' | 'decline') {
    if (this.isRespondingOffer) return;

    const token = this.getStudentToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` } as any;

    this.isRespondingOffer = true;

    Swal.fire({
      title: action === 'accept' ? 'Accepting offer...' : 'Declining offer...',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    this.http
      .put(
        `${this.apiUrl}/volunteers/offers/${offerId}/respond`,
        { action },
        { headers }
      )
      .subscribe({
        next: (res: any) => {
          Swal.fire({
            icon: 'success',
            title: action === 'accept' ? 'Offer accepted!' : 'Offer declined',
            text:
              res?.message ||
              (action === 'accept'
                ? 'Order has been assigned to you.'
                : 'Offer declined.'),
            confirmButtonText: 'OK',
            confirmButtonColor: '#52796f',
          });

          if (action === 'accept') {
            this.fetchVolunteerAssignments();
          }
        },
        error: (err) => {
          Swal.fire({
            icon: 'error',
            title: 'Offer response failed',
            text:
              err?.error?.message ||
              'Failed to process your response. Please try again.',
            confirmButtonText: 'OK',
            confirmButtonColor: '#d33',
          });
        },
        complete: () => {
          this.isRespondingOffer = false;
          this.activeOfferId = undefined;
          this.pollOfferOnce();
        },
      });
  }

  private formatTimeToAMPM(time: string): string {
    if (!time) return time;
    const parts = time.split(':').map((n) => Number(n));
    const hours = parts[0] || 0;
    const minutes = parts[1] || 0;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')} ${ampm}`;
  }

  private handleAvailabilityChange(isAvailable: boolean): void {
    if (this.isVolunteer && isAvailable) {
      this.fetchVolunteerAssignments();
      this.startOfferPolling();
    } else {
      this.volunteerAssignmentsCount = 0;
      this.stopOfferPolling();
    }
  }

  private registerEventListeners(): void {
    window.addEventListener(
      'student-cart-updated',
      this.cartUpdateListener as EventListener
    );
    window.addEventListener(
      'student-orders-updated',
      this.ordersUpdateListener as EventListener
    );
    window.addEventListener(
      'volunteer-availability-updated',
      this.volunteerAvailabilityListener as EventListener
    );
    window.addEventListener(
      'volunteer-assignments-updated',
      this.volunteerAssignmentsListener as EventListener
    );
  }

  private removeEventListeners(): void {
    window.removeEventListener(
      'student-cart-updated',
      this.cartUpdateListener as EventListener
    );
    window.removeEventListener(
      'student-orders-updated',
      this.ordersUpdateListener as EventListener
    );
    window.removeEventListener(
      'volunteer-availability-updated',
      this.volunteerAvailabilityListener as EventListener
    );
    window.removeEventListener(
      'volunteer-assignments-updated',
      this.volunteerAssignmentsListener as EventListener
    );
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.updateCartCountFromStorage();
      this.fetchPendingOrdersCount();
      this.fetchVolunteerAssignments();
      if (this.isVolunteer && this.isAvailable) {
        this.pollOfferOnce();
      }
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.stopOfferPolling();
    this.removeEventListeners();
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  navigateToCart() {
    this.router.navigate(['/student/cart']);
  }

  navigateToOrders() {
    this.router.navigate(['/student/orders']);
  }

  navigateToVolunteerOrders() {
    this.router.navigate(['/student/volunteer-orders']);
  }

  navigateHome() {
    this.router.navigate(['/student/stud-dashboard']);
  }

  logout() {
    sessionStorage.removeItem('student_token');
    sessionStorage.removeItem('student_cart');
    this.router.navigate(['/home']);
    this.isDropdownOpen = false; // Close the dropdown after logging out
    this.isVolunteer = false;
    this.isAvailable = false;
    this.pendingOrdersCount = 0;
    this.cartItemCount = 0;
    this.volunteerAssignmentsCount = 0;
    this.stopOfferPolling();
  }

  navigateToProfile() {
    this.router.navigate(['/student/profile']);
    this.isDropdownOpen = false; // Close the dropdown after navigating
  }

  toggleAvailability(): void {
    const currentStatus = this.isAvailable;
    const next = !currentStatus;
    const statusText = next ? 'available' : 'unavailable';

    // If trying to enable availability, check for pending/ready orders first
    if (next) {
      this.checkPendingOrdersBeforeEnabling();
      return;
    }

    // If disabling availability, check for volunteer orders first
    this.checkVolunteerOrdersBeforeDisabling();
  }

  private checkPendingOrdersBeforeEnabling(): void {
    const token = this.getStudentToken();
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` } as any;

    // Show loading state while checking orders
    Swal.fire({
      title: 'Checking Orders...',
      text: 'Please wait while we check your order history.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    this.http.get(`${this.apiUrl}/orders/my`, { headers }).subscribe({
      next: (orders: any) => {
        // Check for pending or ready orders
        const pendingOrReadyOrders = orders.filter((order: any) =>
          ['pending', 'preparing', 'ready', 'on_delivery'].includes(
            (order?.status || '').toLowerCase()
          )
        );

        if (pendingOrReadyOrders.length > 0) {
          // Close loading dialog
          Swal.close();

          // Show error message
          Swal.fire({
            icon: 'warning',
            title: 'Active Orders Detected',
            text: "You still have active orders. Please complete or cancel them before setting your status to 'Available'.",
            confirmButtonText: 'OK',
            confirmButtonColor: '#52796f',
          });
          return;
        }

        // No pending orders, proceed with enabling availability
        Swal.close();
        this.confirmEnableAvailability();
      },
      error: (error) => {
        console.error('Error checking orders:', error);
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Check Failed',
          text: 'Failed to check your order history. Please try again.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#d33',
        });
      },
    });
  }

  private confirmEnableAvailability(): void {
    Swal.fire({
      title: 'Enable Availability',
      text: 'Are you sure you want to mark yourself as available for deliveries?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, enable!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        this.updateAvailabilityStatus(true, 'available');
      }
    });
  }

  private checkVolunteerOrdersBeforeDisabling(): void {
    const token = this.getStudentToken();
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` } as any;

    // Show loading state while checking volunteer orders
    Swal.fire({
      title: 'Checking Orders...',
      text: 'Please wait while we check your volunteer orders.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    this.http.get(`${this.apiUrl}/orders/for-delivery`, { headers }).subscribe({
      next: (orders: any) => {
        // Check if there are any volunteer orders
        const volunteerOrders = Array.isArray(orders) ? orders : [];
        
        if (volunteerOrders.length > 0) {
          // Close loading dialog
          Swal.close();

          // Show error message
          Swal.fire({
            icon: 'warning',
            title: 'Active Volunteer Orders Detected',
            text: `You have ${volunteerOrders.length} active volunteer order(s). Please complete or cancel them before setting your status to 'Not Available'.`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#52796f',
          });
          return;
        }

        // No volunteer orders, proceed with disabling availability
        Swal.close();
        Swal.fire({
          title: 'Update Availability',
          text: 'Are you sure you want to mark yourself as unavailable for deliveries?',
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#52796f',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Yes, update!',
          cancelButtonText: 'Cancel',
        }).then((result) => {
          if (result.isConfirmed) {
            this.updateAvailabilityStatus(false, 'unavailable');
          }
        });
      },
      error: (error) => {
        console.error('Error checking volunteer orders:', error);
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Check Failed',
          text: 'Failed to check your volunteer orders. Please try again.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#d33',
        });
      },
    });
  }

  private updateAvailabilityStatus(
    isAvailable: boolean,
    statusText: string
  ): void {
    // Show loading state
    Swal.fire({
      title: 'Updating Availability...',
      text: 'Please wait while we update your availability status.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const token = this.getStudentToken();
    if (!token) {
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: 'Authentication token not found. Please log in again.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#d33',
      });
      return;
    }

    const headers = { Authorization: `Bearer ${token}` } as any;

    this.http
      .put(
        `${this.apiUrl}/volunteers/availability`,
        { is_available: isAvailable },
        { headers }
      )
      .subscribe({
        next: (res: any) => {
          // Only update the UI state after successful API call
          this.isAvailable = !!res?.is_available;
          this.handleAvailabilityChange(this.isAvailable);

          window.dispatchEvent(
            new CustomEvent('volunteer-availability-updated', {
              detail: { isAvailable: this.isAvailable },
            })
          );

          Swal.fire({
            icon: 'success',
            title: 'Availability Updated!',
            text: `You are now marked as ${statusText} for deliveries.`,
            timer: 1500,
            showConfirmButton: false,
          });
        },
        error: () => {
          // Don't update the UI state on error - keep the original state
          Swal.fire({
            icon: 'error',
            title: 'Update Failed',
            text: 'Failed to update availability. Please try again.',
            confirmButtonText: 'OK',
            confirmButtonColor: '#d33',
          });
        },
      });
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-section')) {
      this.isDropdownOpen = false;
    }
  }

  @HostListener('window:storage', ['$event'])
  onStorageChange(event: StorageEvent) {
    if (event.key === 'student_cart') {
      this.updateCartCountFromStorage();
    }
  }
}
