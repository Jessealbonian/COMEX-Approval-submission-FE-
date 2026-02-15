import { Component, OnInit, OnDestroy } from '@angular/core';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [TopnavStaffComponent, SidenavComponent, CommonModule, FormsModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
})
export class OrdersComponent implements OnInit, OnDestroy {
  apiUrl = environment.apiUrl;
  activeTab: 'pending' | 'completed' | 'cancelled' = 'pending';
  orders: any[] = [];
  modalOpen = false;
  selectedOrder: any = null;
  selectedStatus: string = '';
  private refreshInterval: any;
  isRefreshing = false;
  lastRefreshTime: Date | null = null;
  private readonly autoCancellationReason =
    'Order automatically cancelled due to no pickup/delivery within the allowed time.';
  private readonly autoCancelableStatuses = new Set([
    'pending',
    'preparing',
    'ready',
    'on_delivery',
  ]);
  private autoCancellationCheckInProgress = false;
  private autoCancellingOrders = new Set<number>();
  private autoCancelledOrderIds = new Set<number>();
  readonly cancellationReasons = [
    'Order cancelled due to no pickup/delivery',
    'Incorrect order details',
    'Payment issue / unpaid order',
    'Customer requested cancellation',
    'Item is out of stock',
    'Duplicate order',
    'Custom reason'
  ];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadOrders();
    // Start auto-refresh every 30 seconds
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  startAutoRefresh(): void {
    // Refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadOrders(true); // silent refresh
    }, 30000);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  loadOrders(silent: boolean = false): void {
    if (!silent) {
      this.isRefreshing = true;
    }

    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };
    this.http.get(`${this.apiUrl}/orders`, { headers }).subscribe({
      next: (res: any) => {
        this.orders = res;
        this.lastRefreshTime = new Date();
        this.isRefreshing = false;
        this.broadcastOrdersBadge();
        if (Array.isArray(this.orders)) {
          const cancelledIds = new Set(
            this.orders
              .filter((o) => o?.status === 'cancelled' && o?.order_id)
              .map((o) => o.order_id)
          );
          this.autoCancelledOrderIds.forEach((id) => {
            if (!cancelledIds.has(id)) {
              this.autoCancelledOrderIds.delete(id);
            }
          });
        }
        this.autoCancelExpiredOrders();
      },
      error: (err) => {
        console.error('Failed to load orders', err);
        this.isRefreshing = false;
      },
    });
  }

  manualRefresh(): void {
    this.loadOrders();
  }

  setTab(tab: 'pending' | 'completed' | 'cancelled') {
    this.activeTab = tab;
  }

  filteredOrders() {
    if (this.activeTab === 'pending') {
      return this.orders.filter(
        (o) =>
          o.status === 'pending' ||
          o.status === 'ready' ||
          o.status === 'on_delivery' ||
          o.status === 'preparing'
      );
    } else if (this.activeTab === 'completed') {
      return this.orders.filter((o) => o.status === 'delivered');
    } else if (this.activeTab === 'cancelled') {
      return this.orders.filter((o) => o.status === 'cancelled');
    }
    return [];
  }

  statusColor(status: string): string {
    switch (status) {
      case 'pending':
        return '#EAB308';
      case 'preparing':
        return '#0EA5E9';
      case 'ready':
      case 'on_delivery':
        return '#8B5CF6';
      case 'delivered':
        return '#22C55E';
      case 'cancelled':
        return '#FE0000';
      default:
        return '#6B7280';
    }
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

  getStatusLabelForTab(): string {
    switch (this.activeTab) {
      case 'pending':
        return 'pending';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'orders';
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

  viewOrder(orderId: number) {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'Please log in again to view order details.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    this.http.get(`${this.apiUrl}/orders/${orderId}`, { headers }).subscribe({
      next: (res: any) => {
        this.selectedOrder = res;
        // Only set selectedStatus for orders that can be modified
        // Always set to the current order status to prevent dropdown from showing wrong value
        if (this.canModifyOrder(res.status)) {
          this.selectedStatus = res.status;
        } else {
          this.selectedStatus = res.status; // Keep the actual status even if can't modify
        }
        this.modalOpen = true;
      },
      error: (err) => {
        console.error('Failed to get order', err);
        Swal.fire({
          icon: 'error',
          title: 'Failed to Load Order',
          text: 'Unable to load order details. Please try again.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#52796f',
        });
      },
    });
  }

  closeModal() {
    this.modalOpen = false;
    this.selectedOrder = null;
  }

  updateOrderStatus(orderId: number, status: string) {
    // Get status label for confirmation message
    const statusLabel = this.statusLabel(status);

    // Store the original status to revert if cancelled or on error
    const originalStatus = this.selectedOrder?.status || 'pending';

    // Update selectedStatus immediately so dropdown reflects the change
    // We'll revert it if cancelled or on error
    this.selectedStatus = status;

    if (status === 'cancelled') {
      Swal.fire({
        title: 'Cancel Order',
        html: `
          <div class="cancellation-form">
            <label for="cancellation-reason-select" style="display: block; margin-bottom: 8px; font-weight: 500;">
              Select a reason (or choose "Custom reason" to type your own):
            </label>
            <select id="cancellation-reason-select" class="swal2-select" style="width: 100%; margin-bottom: 12px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="">-- Select a reason --</option>
              ${this.cancellationReasons.map(reason => 
                `<option value="${reason}">${reason}</option>`
              ).join('')}
            </select>
            <label for="cancellation-reason-text" style="display: block; margin-bottom: 8px; font-weight: 500;">
              Cancellation Reason:
            </label>
            <textarea id="cancellation-reason-text" class="swal2-textarea" 
              placeholder="Enter reason here... (max 500 characters)" 
              style="width: 100%; min-height: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"
              maxlength="500"></textarea>
            <small style="display: block; margin-top: 4px; color: #666;">
              You can select a preset reason above or type a custom reason below.
            </small>
          </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#52796f',
        confirmButtonText: 'Cancel Order',
        cancelButtonText: 'Keep Order',
        reverseButtons: true,
        didOpen: () => {
          const select = document.getElementById('cancellation-reason-select') as HTMLSelectElement;
          const textarea = document.getElementById('cancellation-reason-text') as HTMLTextAreaElement;
          
          if (select && textarea) {
            // When a preset reason is selected, populate the textarea
            select.addEventListener('change', () => {
              if (select.value && select.value !== 'Custom reason') {
                textarea.value = select.value;
              } else if (select.value === 'Custom reason') {
                textarea.value = '';
                textarea.focus();
              }
            });
            
            // Focus on textarea initially
            setTimeout(() => textarea.focus(), 100);
          }
        },
        preConfirm: () => {
          const select = document.getElementById('cancellation-reason-select') as HTMLSelectElement;
          const textarea = document.getElementById('cancellation-reason-text') as HTMLTextAreaElement;
          
          if (!select || !textarea) {
            Swal.showValidationMessage('Form elements not found');
            return false;
          }
          
          const reason = textarea.value.trim();
          
          if (!reason) {
            Swal.showValidationMessage(
              'Please provide a cancellation reason before proceeding.'
            );
            return false;
          }
          
          return reason;
        },
      }).then((result) => {
        if (result.isConfirmed && result.value) {
          const token =
            sessionStorage.getItem('staff_token') ||
            localStorage.getItem('staffToken');
          if (!token) {
            this.selectedStatus = originalStatus;
            return;
          }
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          } as any;
          const reason = String(result.value).trim();

          this.http
            .put(
              `${this.apiUrl}/orders/${orderId}/status`,
              { status, cancellation_reason: reason },
              { headers }
            )
            .subscribe({
              next: () => {
                Swal.fire({
                  icon: 'success',
                  title: 'Order Cancelled',
                  text: `Order status has been changed to "${statusLabel}". Reason: ${reason}`,
                  confirmButtonColor: '#52796f',
                });
                this.loadOrders();
                if (
                  this.selectedOrder &&
                  this.selectedOrder.order_id === orderId
                ) {
                  this.viewOrder(orderId);
                }
              },
              error: (err) => {
                console.error('Failed to cancel order', err);
                this.selectedStatus = originalStatus;
                Swal.fire({
                  icon: 'error',
                  title: 'Error',
                  text:
                    err?.error?.message ||
                    'Failed to cancel the order. Please try again.',
                  confirmButtonColor: '#52796f',
                });
              },
            });
        } else {
          this.selectedStatus = originalStatus;
        }
      });
      return;
    }

    // If status is 'delivered', require amount_given input
    if (status === 'delivered') {
      const orderTotal = this.selectedOrder?.summary?.total || 0;

      Swal.fire({
        title: 'Complete Order',
        html: `
          <div class="payment-modal-content">
            <div class="order-total-display">
              <span class="total-label">Total Amount:</span>
              <span class="total-amount">₱${orderTotal.toFixed(2)}</span>
            </div>
            <div class="input-section">
              <label for="amount-given" class="input-label">Amount Given by Student:</label>
              <input type="number" id="amount-given" class="payment-input" 
                     placeholder="0.00" min="${orderTotal}" step="0.01">
            </div>
            <div id="change-display" class="change-display"></div>
          </div>
        `,
        width: 'auto',
        customClass: {
          popup: 'payment-modal-popup',
          title: 'payment-modal-title',
          htmlContainer: 'payment-modal-html',
          confirmButton: 'payment-confirm-btn',
          cancelButton: 'payment-cancel-btn',
          actions: 'payment-actions',
        },
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#52796f',
        cancelButtonColor: '#d33',
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Complete Order',
        reverseButtons: true,
        preConfirm: () => {
          const amountGivenInput = document.getElementById(
            'amount-given'
          ) as HTMLInputElement;
          const amountGiven = amountGivenInput?.value
            ? parseFloat(amountGivenInput.value)
            : null;

          if (!amountGiven || amountGiven <= 0) {
            Swal.showValidationMessage(
              'Please enter a valid amount greater than 0'
            );
            return false;
          }

          if (amountGiven < orderTotal) {
            Swal.showValidationMessage(
              `Amount given (₱${amountGiven.toFixed(
                2
              )}) is less than the total (₱${orderTotal.toFixed(2)})`
            );
            return false;
          }

          return amountGiven;
        },
        didOpen: () => {
          const amountGivenInput = document.getElementById(
            'amount-given'
          ) as HTMLInputElement;
          const changeDisplay = document.getElementById('change-display');

          if (amountGivenInput && changeDisplay) {
            amountGivenInput.addEventListener('input', () => {
              const amountGiven = parseFloat(amountGivenInput.value) || 0;
              if (amountGiven > 0) {
                if (amountGiven >= orderTotal) {
                  const change = amountGiven - orderTotal;
                  changeDisplay.textContent = `Change: ₱${change.toFixed(2)}`;
                  changeDisplay.style.backgroundColor = '#f0f9f4';
                  changeDisplay.style.borderColor = '#d1f4e0';
                  changeDisplay.style.color = '#22c55e';
                } else {
                  const shortage = orderTotal - amountGiven;
                  changeDisplay.textContent = `Insufficient: ₱${shortage.toFixed(
                    2
                  )} more needed`;
                  changeDisplay.style.backgroundColor = '#fef2f2';
                  changeDisplay.style.borderColor = '#fecaca';
                  changeDisplay.style.color = '#ef4444';
                }
              } else {
                changeDisplay.textContent = '';
              }
            });

            // Focus on input
            setTimeout(() => amountGivenInput.focus(), 100);
          }
        },
      }).then((result) => {
        if (result.isConfirmed && result.value) {
          const amountGiven = result.value;
          const change = amountGiven - orderTotal;

          // Proceed with status update
          const token =
            sessionStorage.getItem('staff_token') ||
            localStorage.getItem('staffToken');
          if (!token) {
            // Reset status if no token
            this.selectedStatus = originalStatus;
            return;
          }
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          } as any;

          this.http
            .put(
              `${this.apiUrl}/orders/${orderId}/status`,
              { status, amount_given: amountGiven },
              { headers }
            )
            .subscribe({
              next: (res: any) => {
                // Show success message with change
                Swal.fire({
                  title: 'Order Completed!',
                  html: `
                    <p>Order status has been changed to "${statusLabel}".</p>
                    <p><strong>Amount Given:</strong> ₱${amountGiven.toFixed(
                      2
                    )}</p>
                    <p><strong>Change:</strong> ₱${change.toFixed(2)}</p>
                  `,
                  icon: 'success',
                  confirmButtonColor: '#52796f',
                });
                this.loadOrders();
                if (
                  this.selectedOrder &&
                  this.selectedOrder.order_id === orderId
                ) {
                  this.viewOrder(orderId);
                }
              },
              error: (err) => {
                console.error('Failed to update status', err);
                // Reset status on error
                this.selectedStatus = originalStatus;
                // Show error message
                Swal.fire({
                  title: 'Error!',
                  text:
                    err?.error?.message ||
                    'Failed to update order status. Please try again.',
                  icon: 'error',
                  confirmButtonColor: '#52796f',
                });
              },
            });
        } else {
          // User cancelled - reset status to original
          this.selectedStatus = originalStatus;
        }
      });
    } else {
      // For non-delivered status changes, use the original confirmation
      Swal.fire({
        title: 'Confirm Status Change',
        text: `Are you sure you want to change the order status to "${statusLabel}"?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#52796f',
        cancelButtonColor: '#d33',
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Yes, change it!',
        reverseButtons: true,
      }).then((result) => {
        if (result.isConfirmed) {
          // Proceed with status update
          const token =
            sessionStorage.getItem('staff_token') ||
            localStorage.getItem('staffToken');
          if (!token) {
            // Reset status if no token
            this.selectedStatus = originalStatus;
            return;
          }
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          } as any;

          this.http
            .put(
              `${this.apiUrl}/orders/${orderId}/status`,
              { status },
              { headers }
            )
            .subscribe({
              next: () => {
                // Show success message
                Swal.fire(
                  'Status Updated!',
                  `Order status has been changed to "${statusLabel}".`,
                  'success'
                );
                this.loadOrders();
                if (
                  this.selectedOrder &&
                  this.selectedOrder.order_id === orderId
                ) {
                  this.viewOrder(orderId);
                }
              },
              error: (err) => {
                console.error('Failed to update status', err);
                // Reset status on error
                this.selectedStatus = originalStatus;
                // Show error message
                Swal.fire(
                  'Error!',
                  'Failed to update order status. Please try again.',
                  'error'
                );
              },
            });
        } else {
          // User cancelled - reset status to original
          this.selectedStatus = originalStatus;
        }
      });
    }
  }

  // Helper method to check if an order can be modified
  canModifyOrder(status: string): boolean {
    return status !== 'delivered' && status !== 'cancelled';
  }

  private shouldAutoCancel(order: any, referenceDate: Date): boolean {
    if (!order || !this.autoCancelableStatuses.has(order.status)) {
      return false;
    }

    const preferredDate = this.getPreferredDate(order);
    if (!preferredDate) {
      return false;
    }

    const cancelThreshold = preferredDate.getTime() + 20 * 60 * 1000;
    return referenceDate.getTime() >= cancelThreshold;
  }

  private getPreferredDate(order: any): Date | null {
    if (!order?.preferred_time || !order?.created_at) {
      return null;
    }

    const createdAt = new Date(order.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    const rawTime = String(order.preferred_time).trim();
    let hours: number | null = null;
    let minutes: number | null = null;
    let seconds: number | null = null;

    const match24 = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (match24) {
      hours = Number(match24[1]);
      minutes = Number(match24[2]);
      seconds = Number(match24[3] || 0);
    } else {
      const match12 = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match12) {
        return null;
      }
      hours = Number(match12[1]);
      minutes = Number(match12[2]);
      seconds = 0;
      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
      }
      const period = match12[3].toUpperCase();
      if (period === 'PM' && hours !== 12) {
        hours += 12;
      }
      if (period === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    if (
      hours === null ||
      minutes === null ||
      seconds === null ||
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      Number.isNaN(seconds)
    ) {
      return null;
    }

    const preferredDate = new Date(createdAt);
    preferredDate.setHours(hours, minutes, seconds, 0);

    if (preferredDate.getTime() < createdAt.getTime()) {
      preferredDate.setDate(preferredDate.getDate() + 1);
    }

    return preferredDate;
  }

  private async autoCancelExpiredOrders(): Promise<void> {
    if (this.autoCancellationCheckInProgress) {
      return;
    }

    if (!Array.isArray(this.orders) || this.orders.length === 0) {
      return;
    }

    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (!token) {
      return;
    }

    const now = new Date();
    const dueOrders = this.orders.filter(
      (order) =>
        order?.order_id &&
        !this.autoCancelledOrderIds.has(order.order_id) &&
        this.shouldAutoCancel(order, now)
    );

    if (dueOrders.length === 0) {
      return;
    }

    this.autoCancellationCheckInProgress = true;

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    } as any;
    const autoCancelledIds: number[] = [];

    try {
      for (const order of dueOrders) {
        const orderId = order.order_id;
        if (!orderId || this.autoCancellingOrders.has(orderId)) {
          continue;
        }

        this.autoCancellingOrders.add(orderId);
        try {
          await firstValueFrom(
            this.http.put(
              `${this.apiUrl}/orders/${orderId}/status`,
              {
                status: 'cancelled',
                cancellation_reason: this.autoCancellationReason,
              },
              { headers }
            )
          );
          autoCancelledIds.push(orderId);
          this.autoCancelledOrderIds.add(orderId);
        } catch (err) {
          console.error(`Failed to auto-cancel order ${orderId}`, err);
        } finally {
          this.autoCancellingOrders.delete(orderId);
        }
      }
    } finally {
      this.autoCancellationCheckInProgress = false;
    }

    if (autoCancelledIds.length > 0) {
      Swal.fire({
        icon: 'info',
        title: 'Orders Auto-Cancelled',
        text: `${autoCancelledIds.length} order(s) were automatically cancelled because they were not picked up or delivered within 20 minutes of the preferred time.`,
        confirmButtonColor: '#52796f',
      });

      this.loadOrders(true);

      if (
        this.selectedOrder &&
        autoCancelledIds.includes(this.selectedOrder.order_id)
      ) {
        this.viewOrder(this.selectedOrder.order_id);
      }
    }
  }

  private broadcastOrdersBadge(): void {
    const attentionStatuses = ['pending', 'preparing', 'ready', 'on_delivery'];
    const ordersList = Array.isArray(this.orders) ? this.orders : [];

    const attentionCount = ordersList.filter((order) => {
      const status = (order?.status || '')
        .toString()
        .trim()
        .toLowerCase();
      return attentionStatuses.includes(status);
    }).length;

    const assignedOrders = ordersList.filter((order) => {
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

    window.dispatchEvent(
      new CustomEvent('staff-orders-updated', {
        detail: {
          attentionCount,
          assignedOrders,
        },
      })
    );
  }
}
