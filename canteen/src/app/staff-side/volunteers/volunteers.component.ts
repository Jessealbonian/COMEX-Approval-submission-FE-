import { Component, OnInit } from '@angular/core';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-volunteers',
  standalone: true,
  imports: [TopnavStaffComponent, SidenavComponent, CommonModule, FormsModule],
  templateUrl: './volunteers.component.html',
  styleUrl: './volunteers.component.css',
})
export class VolunteersComponent implements OnInit {
  apiUrl = environment.apiUrl;
  applications: any[] = [];
  availableVolunteers: any[] = [];
  ordersForDelivery: any[] = [];
  assignedOrders: any[] = [];
  applicationTab: 'pending' | 'approved' = 'pending';
  deliveryFee: number = 10.0;
  deliveryFeeInput: number = 10.0;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadApplications();
    this.loadAvailableVolunteers();
    this.loadDeliveryOrders();
    this.loadAssignedOrders();
    this.loadDeliveryFee();
  }

  private staffHeaders() {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    return { Authorization: `Bearer ${token}` } as any;
  }

  loadApplications() {
    this.http
      .get(`${this.apiUrl}/volunteers/applications`, {
        headers: this.staffHeaders(),
      })
      .subscribe({
        next: (rows: any) => {
          this.applications = rows || [];
          this.broadcastVolunteerBadge();
        },
        error: (err) => console.error(err),
      });
  }

  switchTab(tab: 'pending' | 'approved') {
    this.applicationTab = tab;
  }

  getFilteredApplications() {
    return this.applications.filter((app) =>
      this.applicationTab === 'pending'
        ? app.status === 'pending'
        : app.status === 'approved'
    );
  }

  approve(appId: number) {
    const application = this.applications.find((app) => app.id === appId);
    const applicantName = application
      ? application.name || 'this applicant'
      : 'this applicant';

    Swal.fire({
      title: 'Approve Volunteer',
      text: `Are you sure you want to approve ${applicantName} as a volunteer?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, approve!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Approving Volunteer...',
          text: 'Please wait while we approve the volunteer application.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.http
          .put(
            `${this.apiUrl}/volunteers/applications/${appId}/approve`,
            {},
            { headers: this.staffHeaders() }
          )
          .subscribe({
            next: () => {
              this.loadApplications();
              Swal.fire({
                icon: 'success',
                title: 'Volunteer Approved!',
                text: `${applicantName} has been successfully approved as a volunteer.`,
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
            error: (err) => {
              Swal.fire({
                icon: 'error',
                title: 'Approval Failed',
                text:
                  err?.error?.message ||
                  'Failed to approve volunteer. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
          });
      }
    });
  }

  reject(appId: number) {
    const application = this.applications.find((app) => app.id === appId);
    const applicantName = application
      ? application.name || 'this applicant'
      : 'this applicant';

    Swal.fire({
      title: 'Decline Volunteer',
      text: `Are you sure you want to decline ${applicantName}'s volunteer application?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#52796f',
      confirmButtonText: 'Yes, decline!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Declining Application...',
          text: 'Please wait while we decline the volunteer application.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.http
          .put(
            `${this.apiUrl}/volunteers/applications/${appId}/reject`,
            {},
            { headers: this.staffHeaders() }
          )
          .subscribe({
            next: () => {
              this.loadApplications();
              Swal.fire({
                icon: 'success',
                title: 'Application Declined!',
                text: `${applicantName}'s volunteer application has been declined.`,
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
            error: (err) => {
              Swal.fire({
                icon: 'error',
                title: 'Decline Failed',
                text:
                  err?.error?.message ||
                  'Failed to decline application. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
          });
      }
    });
  }

  loadAvailableVolunteers() {
    this.http
      .get(`${this.apiUrl}/volunteers/list`, { headers: this.staffHeaders() })
      .subscribe({
        next: (rows: any) => (this.availableVolunteers = rows || []),
        error: (err) => console.error(err),
      });
  }

  loadDeliveryOrders() {
    // Use staff orders list and filter in UI, but better to query
    const headers = this.staffHeaders();
    this.http.get<any[]>(`${this.apiUrl}/orders`, { headers }).subscribe(
      (rows) => {
        // Only show orders that need delivery and haven't been assigned yet
        this.ordersForDelivery = (rows || []).filter(
          (o) =>
            o.delivery_option === 'delivery' &&
            (o.status === 'ready' || o.status === 'on_delivery') &&
            (!o.volunteer_id || o.volunteer_id <= 0)
        );
      },
      (err) => console.error(err)
    );
  }

  assign(orderId: number, volunteerId: number) {
    if (!volunteerId || volunteerId <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Volunteer',
        text: 'Please select a valid volunteer to assign.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
      return;
    }

    const volunteer = this.availableVolunteers.find(
      (v) => v.user_id === volunteerId
    );
    const volunteerName = volunteer ? volunteer.name : 'this volunteer';
    const order = this.ordersForDelivery.find((o) => o.order_id === orderId);
    const orderInfo = order ? `Order #${orderId}` : 'this order';

    Swal.fire({
      title: 'Send Offer',
      text: `Send a delivery offer to ${volunteerName} for ${orderInfo}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, send offer!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Sending offer...',
          text: 'Please wait while we notify the volunteer.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.http
          .put(
            `${this.apiUrl}/volunteers/assign`,
            { order_id: orderId, volunteer_id: volunteerId },
            { headers: this.staffHeaders() }
          )
          .subscribe({
            next: () => {
              this.loadDeliveryOrders();
              this.loadAssignedOrders();

              Swal.fire({
                icon: 'success',
                title: 'Offer Sent!',
                text: `${volunteerName} has been notified and must accept the offer to take ${orderInfo}.`,
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
            error: (err) => {
              Swal.fire({
                icon: 'error',
                title: 'Assignment Failed',
                text:
                  err?.error?.message ||
                  'Failed to assign volunteer. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
          });
      }
    });
  }

  loadAssignedOrders() {
    const headers = this.staffHeaders();
    this.http.get<any[]>(`${this.apiUrl}/orders`, { headers }).subscribe(
      (rows) => {
        // Show orders that have been assigned to volunteers
        this.assignedOrders = (rows || []).filter(
          (o) =>
            o.delivery_option === 'delivery' &&
            (o.status === 'ready' || o.status === 'on_delivery') &&
            o.volunteer_id &&
            o.volunteer_id > 0
        );
        this.broadcastVolunteerBadge();
      },
      (err) => console.error(err)
    );
  }

  formatTimeToAMPM(time: string | null | undefined): string {
    if (!time) return 'Not set';
    // Convert 24-hour format to 12-hour AM/PM format
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')} ${ampm}`;
  }

  getVolunteerName(volunteerId: number): string {
    const volunteer = this.availableVolunteers.find(
      (v) => v.user_id === volunteerId
    );
    if (volunteer) return volunteer.name;

    const assigned = this.assignedOrders.find(
      (o) => o.volunteer_id === volunteerId
    );
    if (assigned?.volunteer_name) return assigned.volunteer_name;

    return 'Unknown';
  }

  offerStatusLabel(order: any): string {
    const status = (order?.current_offer_status || '').toLowerCase();
    const targetName =
      order?.offer_volunteer_name ||
      this.getVolunteerName(order?.offer_volunteer_id);

    if (!status) return 'No offer sent';
    if (status === 'pending') {
      return targetName
        ? `Offer sent to ${targetName}`
        : 'Offer sent to volunteer';
    }
    if (status === 'accepted') {
      return targetName ? `${targetName} accepted` : 'Offer accepted';
    }
    if (status === 'declined') {
      return targetName ? `${targetName} declined` : 'Offer declined';
    }
    if (status === 'timed_out') {
      return 'Offer timed out';
    }
    return status;
  }

  offerStatusClass(order: any): string {
    const status = (order?.current_offer_status || '').toLowerCase();
    switch (status) {
      case 'pending':
        return 'badge badge-pending';
      case 'accepted':
        return 'badge badge-success';
      case 'declined':
        return 'badge badge-declined';
      case 'timed_out':
        return 'badge badge-muted';
      default:
        return 'badge badge-muted';
    }
  }

  isOfferPending(order: any): boolean {
    return (order?.current_offer_status || '').toLowerCase() === 'pending';
  }

  loadDeliveryFee(): void {
    this.http
      .get<{ deliveryFee: number }>(`${this.apiUrl}/api/delivery-fee`)
      .subscribe({
        next: (data) => {
          this.deliveryFee = data.deliveryFee || 10.0;
          this.deliveryFeeInput = this.deliveryFee;
        },
        error: (err) => {
          console.error('Failed to load delivery fee', err);
          this.deliveryFee = 10.0;
          this.deliveryFeeInput = 10.0;
        },
      });
  }

  updateDeliveryFee(): void {
    if (this.deliveryFeeInput < 0) {
      Swal.fire({
        icon: 'error',
        title: 'Invalid Amount',
        text: 'Delivery fee cannot be negative.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#52796f',
      });
      this.deliveryFeeInput = this.deliveryFee;
      return;
    }

    Swal.fire({
      title: 'Update Delivery Fee',
      text: `Are you sure you want to update the delivery fee to ₱${this.deliveryFeeInput.toFixed(
        2
      )}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, update!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Updating Delivery Fee...',
          text: 'Please wait while we update the delivery fee.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.http
          .put(
            `${this.apiUrl}/api/delivery-fee`,
            { deliveryFee: this.deliveryFeeInput },
            { headers: this.staffHeaders() }
          )
          .subscribe({
            next: (response: any) => {
              this.deliveryFee = this.deliveryFeeInput;
              Swal.fire({
                icon: 'success',
                title: 'Delivery Fee Updated!',
                text:
                  response.message ||
                  'Delivery fee has been successfully updated.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
            error: (err) => {
              this.deliveryFeeInput = this.deliveryFee;
              Swal.fire({
                icon: 'error',
                title: 'Update Failed',
                text:
                  err?.error?.message ||
                  'Failed to update delivery fee. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
          });
      } else {
        this.deliveryFeeInput = this.deliveryFee;
      }
    });
  }

  private broadcastVolunteerBadge(): void {
    const pendingApplications = (this.applications || []).filter(
      (app) => (app?.status || '').toLowerCase() === 'pending'
    ).length;

    const assignedOrders = Array.isArray(this.assignedOrders)
      ? this.assignedOrders.length
      : 0;

    window.dispatchEvent(
      new CustomEvent('staff-volunteers-updated', {
        detail: {
          pendingApplications,
          assignedOrders,
        },
      })
    );
  }
}
