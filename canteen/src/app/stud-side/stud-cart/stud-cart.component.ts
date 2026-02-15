import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TopnavComponent } from '../../components/topnav/topnav.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { AuthService } from '../../auth.service';

interface CartItem {
  id: number;
  name: string;
  category: string;
  price: number;
  quantity: number;
}

@Component({
  selector: 'app-stud-cart',
  standalone: true,
  imports: [CommonModule, FormsModule, TopnavComponent, FooterComponent],
  templateUrl: './stud-cart.component.html',
  styleUrl: './stud-cart.component.css',
})
export class StudCartComponent implements OnInit, OnDestroy {
  cartItems: CartItem[] = [];

  deliveryFee: number = 10.0;
  isPickup: boolean = true;
  preferredTimeOptions: string[] = [];
  selectedTime: string = '';
  deliveryRoom: string = '';
  apiUrl = environment.apiUrl;
  deliveryAvailable = true;
  availableVolunteers = 0;
  isVolunteer = false;
  isVolunteerAvailable = false;

  private volunteerAvailabilityListener = (event: Event) => {
    const detail = (event as CustomEvent<{ isAvailable?: boolean }>).detail;
    if (detail && typeof detail.isAvailable === 'boolean') {
      this.isVolunteerAvailable = detail.isAvailable;
    } else {
      this.refreshVolunteerAvailability();
    }
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const saved = sessionStorage.getItem('student_cart');
    this.cartItems = saved ? JSON.parse(saved) : [];
    this.loadDeliveryFee();
    this.updatePreferredTimeOptions();
    this.checkVolunteerAvailability();
    this.initializeVolunteerState();
    window.addEventListener(
      'volunteer-availability-updated',
      this.volunteerAvailabilityListener as EventListener
    );
  }

  ngOnDestroy(): void {
    window.removeEventListener(
      'volunteer-availability-updated',
      this.volunteerAvailabilityListener as EventListener
    );
  }

  private generateTimes(
    start: string,
    end: string,
    intervalMinutes: number
  ): string[] {
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const toLabel = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr12 = h % 12 === 0 ? 12 : h % 12;
      return `${pad(hr12)}:${pad(m)} ${ampm}`;
    };
    const result: string[] = [];
    for (let t = toMinutes(start); t <= toMinutes(end); t += intervalMinutes) {
      result.push(toLabel(t));
    }
    return result;
  }

  private updatePreferredTimeOptions(): void {
    const allTimes = this.generateTimes('08:00', '17:00', 30);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Filter out past time slots
    this.preferredTimeOptions = allTimes.filter((timeStr) => {
      // Parse the time string (e.g., "08:00 AM" or "12:30 PM")
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return true;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      // Convert to 24-hour format
      if (ampm === 'PM' && hours !== 12) {
        hours += 12;
      } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
      }

      const timeMinutes = hours * 60 + minutes;
      return timeMinutes > currentMinutes;
    });

    // Set the first available time slot as selected, or empty if none available
    this.selectedTime = this.preferredTimeOptions[0] || '';
  }

  private loadDeliveryFee(): void {
    this.http
      .get<{ deliveryFee: number }>(`${this.apiUrl}/api/delivery-fee`)
      .subscribe({
        next: (data) => {
          this.deliveryFee = data.deliveryFee || 10.0;
        },
        error: (err) => {
          console.error('Failed to load delivery fee', err);
          this.deliveryFee = 10.0; // Fallback to default
        },
      });
  }

  private checkVolunteerAvailability(): void {
    this.http.get(`${this.apiUrl}/volunteers/available`).subscribe({
      next: (res: any) => {
        this.availableVolunteers = res?.availableCount || 0;
        this.deliveryAvailable = this.availableVolunteers > 0;
        if (!this.deliveryAvailable) {
          this.isPickup = true;
        }
      },
      error: () => {
        this.availableVolunteers = 0;
        this.deliveryAvailable = false;
        this.isPickup = true;
      },
    });
  }

  getSubtotal(): number {
    return this.cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  }

  getDeliveryFee(): number {
    return this.isPickup ? 0 : this.deliveryFee;
  }

  getTotal(): number {
    return this.getSubtotal() + this.getDeliveryFee();
  }

  updateQuantity(item: CartItem, change: number): void {
    const newQuantity = item.quantity + change;
    if (newQuantity > 0) {
      item.quantity = newQuantity;
      sessionStorage.setItem('student_cart', JSON.stringify(this.cartItems));
      this.notifyCartUpdated();
    }
  }

  removeItem(itemId: number): void {
    const item = this.cartItems.find((item) => item.id === itemId);
    const itemName = item ? item.name : 'this item';

    Swal.fire({
      title: 'Remove Item',
      text: `Are you sure you want to remove "${itemName}" from your cart?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#52796f',
      confirmButtonText: 'Yes, remove it!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        this.cartItems = this.cartItems.filter((item) => item.id !== itemId);
        sessionStorage.setItem('student_cart', JSON.stringify(this.cartItems));
        this.notifyCartUpdated();

        Swal.fire({
          icon: 'success',
          title: 'Item Removed',
          text: `${itemName} has been removed from your cart.`,
          timer: 1500,
          showConfirmButton: false,
        });
      }
    });
  }

  updateOrderType(isPickup: boolean): void {
    this.isPickup = isPickup;
  }

  checkout(): void {
    if (this.cartItems.length === 0) return;

    const token =
      sessionStorage.getItem('student_token') ||
      localStorage.getItem('studentToken');
    if (!token) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'Please log in again to proceed with checkout.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
      return;
    }

    // Show checkout confirmation
    const totalItems = this.cartItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
    const deliveryType = this.isPickup ? 'Pickup' : 'Delivery';
    const deliveryInfo = this.isPickup
      ? `Pickup at ${this.selectedTime}`
      : `Delivery to ${this.deliveryRoom} at ${this.selectedTime}`;

    Swal.fire({
      title: 'Confirm Checkout',
      html: `
        <div style="text-align: left;">
          <p><strong>Order Summary:</strong></p>
          <p>• ${totalItems} items</p>
          <p>• ${deliveryType}: ${deliveryInfo}</p>
          <p>• Total: ₱${this.getTotal().toFixed(2)}</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, place order!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Processing Order...',
          text: 'Please wait while we process your order.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const headers = { Authorization: `Bearer ${token}` };
        const payload = {
          items: this.cartItems.map((i) => ({
            product_id: i.id,
            quantity: i.quantity,
            price_each: i.price,
          })),
          delivery_option: this.isPickup ? 'pickup' : 'delivery',
          preferred_time: this.selectedTime,
          delivery_room: this.isPickup ? null : this.deliveryRoom,
        };

        this.http
          .post(`${this.apiUrl}/orders/checkout`, payload, { headers })
          .subscribe({
            next: (res: any) => {
              sessionStorage.removeItem('student_cart');
              this.cartItems = [];
              this.notifyCartUpdated();

              window.dispatchEvent(
                new CustomEvent('student-orders-updated')
              );

              Swal.fire({
                icon: 'success',
                title: 'Order Placed Successfully!',
                text: 'Your order has been placed and is being processed.',
                confirmButtonText: 'View Orders',
                confirmButtonColor: '#52796f',
              }).then(() => {
                this.router.navigate(['/student/orders']);
              });
            },
            error: (err) => {
              console.error('Checkout failed', err);
              Swal.fire({
                icon: 'error',
                title: 'Checkout Failed',
                text:
                  err?.error?.message ||
                  'Failed to place order. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
          });
      }
    });
  }

  navigateToMenu(): void {
    this.router.navigate(['/student/stud-dashboard']);
  }

  private initializeVolunteerState(): void {
    const user = this.authService.getCurrentUser('student');
    this.isVolunteer = user?.role === 'volunteer';

    if (!this.isVolunteer) {
      this.isVolunteerAvailable = false;
      return;
    }

    this.refreshVolunteerAvailability();
  }

  private refreshVolunteerAvailability(): void {
    if (!this.isVolunteer) return;

    const token = this.authService.getToken('student');
    if (!token) {
      this.isVolunteerAvailable = false;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` } as any;
    this.http.get(`${this.apiUrl}/volunteers/me`, { headers }).subscribe({
      next: (res: any) => {
        this.isVolunteerAvailable = !!res?.is_available;
      },
      error: () => {
        this.isVolunteerAvailable = false;
      },
    });
  }


  private notifyCartUpdated(): void {
    try {
      const raw = sessionStorage.getItem('student_cart');
      const cart = raw ? JSON.parse(raw) : [];
      const count = Array.isArray(cart)
        ? cart.reduce(
            (total: number, item: any) =>
              total + (Number(item?.quantity) || 0),
            0
          )
        : 0;

      window.dispatchEvent(
        new CustomEvent('student-cart-updated', {
          detail: { count },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent('student-cart-updated', {
          detail: { count: 0 },
        })
      );
    }
  }
}
