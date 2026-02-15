import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopnavComponent } from '../../components/topnav/topnav.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-stud-orders',
  standalone: true,
  imports: [CommonModule, TopnavComponent, FooterComponent],
  templateUrl: './stud-orders.component.html',
  styleUrl: './stud-orders.component.css',
})
export class StudOrdersComponent implements OnInit {
  apiUrl = environment.apiUrl;
  orders: any[] = [];
  expanded: Set<number> = new Set<number>();

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    const token =
      sessionStorage.getItem('student_token') ||
      localStorage.getItem('studentToken');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    this.http.get(`${this.apiUrl}/orders/my`, { headers }).subscribe({
      next: (res: any) => {
        this.orders = res;
        window.dispatchEvent(new CustomEvent('student-orders-updated'));
      },
      error: (err) => {
        console.error('Failed to load my orders', err);
      },
    });
  }

  toggle(orderId: number) {
    if (this.expanded.has(orderId)) this.expanded.delete(orderId);
    else this.expanded.add(orderId);
  }

  isExpanded(orderId: number) {
    return this.expanded.has(orderId);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'Preparing';
      case 'preparing':
        return 'Preparing';
      case 'ready':
      case 'on_delivery':
        return 'Ready for Pickup/Delivery';
      case 'delivered':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }

  formatTimeLabel(time?: string): string {
    if (!time) return '—';
    try {
      const parts = time.split(':');
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) || 0;
      const ampm = h >= 12 ? 'PM' : 'AM';
      let hr12 = h % 12;
      if (hr12 === 0) hr12 = 12;
      const mm = m.toString().padStart(2, '0');
      return `${hr12}:${mm} ${ampm}`;
    } catch {
      return time as any;
    }
  }
}
