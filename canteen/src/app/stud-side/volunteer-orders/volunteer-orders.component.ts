import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopnavComponent } from '../../components/topnav/topnav.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-volunteer-orders',
  standalone: true,
  imports: [CommonModule, TopnavComponent, FooterComponent],
  templateUrl: './volunteer-orders.component.html',
  styleUrl: './volunteer-orders.component.css',
})
export class VolunteerOrdersComponent implements OnInit {
  apiUrl = environment.apiUrl;
  orders: any[] = [];
  modalOpen = false;
  selectedOrder: any = null;
  isConfirmationActive = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent): void {
    if (this.isConfirmationActive) {
      // If confirmation modal is active, let SweetAlert2 handle the escape key
      return;
    }
    if (this.modalOpen) {
      this.closeModal();
    }
  }

  private volunteerHeaders() {
    const token =
      sessionStorage.getItem('student_token') ||
      localStorage.getItem('studentToken');
    return { Authorization: `Bearer ${token}` } as any;
  }

  loadOrders(): void {
    this.http
      .get(`${this.apiUrl}/orders/for-delivery`, {
        headers: this.volunteerHeaders(),
      })
      .subscribe({
        next: (res: any) => {
          this.orders = res || [];
          window.dispatchEvent(
            new CustomEvent('volunteer-assignments-updated', {
              detail: { count: this.orders.length },
            })
          );
          // Format time to AM/PM
          this.orders.forEach((order) => {
            if (order.preferred_time) {
              order.preferred_time = this.formatTimeToAMPM(
                order.preferred_time
              );
            }
          });
        },
        error: (err) => console.error('Failed to load orders', err),
      });
  }

  private formatTimeToAMPM(time: string): string {
    if (!time) return time;
    // Convert 24-hour format to 12-hour AM/PM format
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')} ${ampm}`;
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

  getStatusColor(status: string): string {
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

  viewOrder(orderId: number) {
    this.http
      .get(`${this.apiUrl}/orders/for-delivery/${orderId}`, {
        headers: this.volunteerHeaders(),
      })
      .subscribe({
        next: (res: any) => {
          this.selectedOrder = res;
          // Format preferred_time to 12-hour format
          if (this.selectedOrder?.preferred_time) {
            this.selectedOrder.preferred_time = this.formatTimeToAMPM(
              this.selectedOrder.preferred_time
            );
          }
          this.modalOpen = true;
        },
        error: (err) => console.error('Failed to get order', err),
      });
  }

  closeModal() {
    if (!this.isConfirmationActive) {
      this.modalOpen = false;
      this.selectedOrder = null;
    }
  }

  setComplete(orderId: number) {
    const order = this.orders.find((o) => o.order_id === orderId);
    const orderInfo = order ? `Order #${orderId}` : 'this order';

    // Get order total from selectedOrder if available, otherwise fetch it
    const orderTotal = this.selectedOrder?.summary?.total || 0;

    this.isConfirmationActive = true;

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
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Complete Order',
      cancelButtonText: 'Cancel',
      allowOutsideClick: false,
      allowEscapeKey: true,
      customClass: {
        popup: 'payment-modal-popup',
        title: 'payment-modal-title',
        htmlContainer: 'payment-modal-html',
        confirmButton: 'payment-confirm-btn',
        cancelButton: 'payment-cancel-btn',
        actions: 'payment-actions',
      },
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
    })
      .then((result) => {
        this.isConfirmationActive = false;
        if (result.isConfirmed && result.value) {
          const amountGiven = result.value;
          const change = amountGiven - orderTotal;

          // Show loading state
          Swal.fire({
            title: 'Completing Order...',
            text: 'Please wait while we update the order status.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            customClass: {
              popup: 'swal-loading-popup',
            },
            didOpen: () => {
              Swal.showLoading();
            },
          });

          this.http
            .put(
              `${this.apiUrl}/orders/${orderId}/complete`,
              { amount_given: amountGiven },
              { headers: this.volunteerHeaders() }
            )
            .subscribe({
              next: (res: any) => {
                this.loadOrders();
                if (this.selectedOrder?.order_id === orderId) {
                  this.viewOrder(orderId);
                }

                Swal.fire({
                  icon: 'success',
                  title: 'Order Completed!',
                  html: `
                    <p>${orderInfo} has been marked as completed successfully.</p>
                    <p><strong>Amount Given:</strong> ₱${amountGiven.toFixed(
                      2
                    )}</p>
                    <p><strong>Change:</strong> ₱${change.toFixed(2)}</p>
                  `,
                  confirmButtonText: 'OK',
                  confirmButtonColor: '#52796f',
                  allowOutsideClick: false,
                  customClass: {
                    popup: 'swal-success-popup',
                  },
                });
              },
              error: (err) => {
                Swal.fire({
                  icon: 'error',
                  title: 'Completion Failed',
                  text:
                    err?.error?.message ||
                    'Failed to complete order. Please try again.',
                  confirmButtonText: 'OK',
                  confirmButtonColor: '#52796f',
                  allowOutsideClick: false,
                  customClass: {
                    popup: 'swal-error-popup',
                  },
                });
              },
            });
        } else {
          // User cancelled, reset state
          this.isConfirmationActive = false;
        }
      })
      .catch(() => {
        // Handle any errors in the promise chain
        this.isConfirmationActive = false;
      });
  }
}
