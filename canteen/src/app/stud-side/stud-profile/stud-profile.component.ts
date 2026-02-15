import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TopnavComponent } from '../../components/topnav/topnav.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { AuthService } from '../../auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PwaService } from '../../services/pwa.service';
import Swal from 'sweetalert2';

interface StudentProfile {
  fullName: string;
  email: string;
  phone: string;
}

@Component({
  selector: 'app-stud-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, TopnavComponent, FooterComponent],
  templateUrl: './stud-profile.component.html',
  styleUrl: './stud-profile.component.css',
})
export class StudProfileComponent implements OnInit {
  isEditing = false;
  studentProfile: StudentProfile = {
    fullName: '',
    email: '',
    phone: '',
  };

  originalProfile: StudentProfile = { ...this.studentProfile };
  apiUrl = environment.apiUrl;
  // Volunteer state
  myVolunteer: {
    role?: string;
    status?: string;
    is_available?: boolean;
    application_status?: string | null;
    availability_start_time?: string | null;
    availability_end_time?: string | null;
  } = {};
  applying = false;
  
  // Availability schedule
  availabilitySchedule: {
    startTime: string;
    endTime: string;
  } = {
    startTime: '',
    endTime: '',
  };
  originalSchedule: {
    startTime: string;
    endTime: string;
  } = {
    startTime: '',
    endTime: '',
  };
  isEditingSchedule = false;

  // PWA state
  canInstall = false;
  isInstalled = false;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private pwaService: PwaService
  ) {}

  ngOnInit(): void {
    this.loadStudentProfile();
    this.loadVolunteerState();
    this.initializePwa();
  }

  loadStudentProfile(): void {
    this.authService.getStudentProfile().subscribe({
      next: (response: any) => {
        if (response.profile) {
          const profile = response.profile;
          this.studentProfile = {
            fullName: profile.name || '',
            email: profile.email || '',
            phone: profile.phone_no || '',
          };
          this.originalProfile = { ...this.studentProfile };
        }
      },
      error: (error) => {
        console.error('Error loading student profile:', error);
        // Fallback to current user data from token
        const currentUser = this.authService.getCurrentUser('student');
        if (currentUser) {
          this.studentProfile = {
            fullName: currentUser.name || '',
            email: currentUser.email || '',
            phone: '',
          };
          this.originalProfile = { ...this.studentProfile };
        }
      },
    });
  }

  loadVolunteerState(): void {
    const token = this.authService.getToken('student');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` } as any;
    this.http.get(`${this.apiUrl}/volunteers/me`, { headers }).subscribe({
      next: (res: any) => {
        this.myVolunteer = res || {};
        // Load schedule times - ensure we properly handle null/undefined values
        const startTime = res?.availability_start_time || '';
        const endTime = res?.availability_end_time || '';
        this.availabilitySchedule = {
          startTime: startTime,
          endTime: endTime,
        };
        // Also update myVolunteer to keep it in sync
        this.myVolunteer.availability_start_time = res?.availability_start_time || null;
        this.myVolunteer.availability_end_time = res?.availability_end_time || null;
        this.originalSchedule = { ...this.availabilitySchedule };
      },
      error: (err) => console.error('Failed to load volunteer state', err),
    });
  }

  applyAsVolunteer(): void {
    if (this.applying) return;

    // Check if this is a reapplication
    const isReapplication = this.myVolunteer?.application_status === 'rejected';
    const title = isReapplication
      ? 'Reapply as Volunteer'
      : 'Apply as Volunteer';
    const text = isReapplication
      ? 'Are you sure you want to submit a new volunteer application? Your previous application was not approved, but you can try again.'
      : 'Are you sure you want to apply as a volunteer? You will be able to deliver orders and earn rewards.';
    const confirmText = isReapplication ? 'Yes, reapply!' : 'Yes, apply!';

    Swal.fire({
      title: title,
      text: text,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        this.applying = true;
        const token = this.authService.getToken('student');
        const headers = { Authorization: `Bearer ${token}` } as any;

        // Show loading state
        Swal.fire({
          title: 'Submitting Application...',
          text: 'Please wait while we submit your volunteer application.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        this.http
          .post(`${this.apiUrl}/volunteers/apply`, {}, { headers })
          .subscribe({
            next: () => {
              this.applying = false;
              const successTitle = isReapplication
                ? 'Reapplication Submitted!'
                : 'Application Submitted!';
              const successText = isReapplication
                ? 'Your new volunteer application has been submitted successfully. You will be notified once it is reviewed.'
                : 'Your volunteer application has been submitted successfully. You will be notified once it is reviewed.';

              Swal.fire({
                icon: 'success',
                title: successTitle,
                text: successText,
                confirmButtonText: 'OK',
                confirmButtonColor: '#3085d6',
              });
              this.loadVolunteerState();
            },
            error: (err) => {
              this.applying = false;
              Swal.fire({
                icon: 'error',
                title: 'Application Failed',
                text:
                  err?.error?.message ||
                  'Failed to submit application. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
          });
      }
    });
  }

  toggleAvailability(): void {
    const currentStatus = this.myVolunteer.is_available;
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

  checkPendingOrdersBeforeEnabling(): void {
    const token = this.authService.getToken('student');
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

  confirmEnableAvailability(): void {
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

  checkVolunteerOrdersBeforeDisabling(): void {
    const token = this.authService.getToken('student');
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

  updateAvailabilityStatus(isAvailable: boolean, statusText: string): void {
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

    const token = this.authService.getToken('student');
    const headers = { Authorization: `Bearer ${token}` } as any;

    // First, fetch the current volunteer state from database to get the latest schedule
    // This ensures we always preserve the existing schedule when toggling availability
    this.http.get(`${this.apiUrl}/volunteers/me`, { headers }).subscribe({
      next: (currentState: any) => {
        // Use the schedule from the database (most reliable source)
        // Only use component state if database doesn't have it and component does
        const dbStartTime = currentState?.availability_start_time;
        const dbEndTime = currentState?.availability_end_time;
        const componentStartTime = this.availabilitySchedule.startTime?.trim() || '';
        const componentEndTime = this.availabilitySchedule.endTime?.trim() || '';
        
        // Prefer database values, fallback to component values if database is null/empty
        const startTime = (dbStartTime && dbStartTime.trim() !== '') 
          ? dbStartTime 
          : (componentStartTime !== '' ? componentStartTime : null);
        const endTime = (dbEndTime && dbEndTime.trim() !== '') 
          ? dbEndTime 
          : (componentEndTime !== '' ? componentEndTime : null);

        // Now update availability with preserved schedule
        this.http
          .put(
            `${this.apiUrl}/volunteers/availability`,
            { 
              is_available: isAvailable,
              availability_start_time: startTime,
              availability_end_time: endTime
            },
            { headers }
          )
          .subscribe({
            next: (res: any) => {
              // Update the UI state after successful API call
              this.myVolunteer.is_available = !!res?.is_available;
              this.myVolunteer.availability_start_time = res?.availability_start_time || null;
              this.myVolunteer.availability_end_time = res?.availability_end_time || null;
              this.availabilitySchedule = {
                startTime: res?.availability_start_time || '',
                endTime: res?.availability_end_time || '',
              };
              this.originalSchedule = { ...this.availabilitySchedule };

              window.dispatchEvent(
                new CustomEvent('volunteer-availability-updated', {
                  detail: { isAvailable: this.myVolunteer.is_available },
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
      },
      error: () => {
        // If we can't fetch current state, still try to update with component state
        // This is a fallback in case the fetch fails
        const startTime = this.availabilitySchedule.startTime?.trim() || 
                          this.myVolunteer.availability_start_time || 
                          null;
        const endTime = this.availabilitySchedule.endTime?.trim() || 
                        this.myVolunteer.availability_end_time || 
                        null;

        this.http
          .put(
            `${this.apiUrl}/volunteers/availability`,
            { 
              is_available: isAvailable,
              availability_start_time: startTime,
              availability_end_time: endTime
            },
            { headers }
          )
          .subscribe({
            next: (res: any) => {
              this.myVolunteer.is_available = !!res?.is_available;
              this.myVolunteer.availability_start_time = res?.availability_start_time || null;
              this.myVolunteer.availability_end_time = res?.availability_end_time || null;
              this.availabilitySchedule = {
                startTime: res?.availability_start_time || '',
                endTime: res?.availability_end_time || '',
              };
              this.originalSchedule = { ...this.availabilitySchedule };

              window.dispatchEvent(
                new CustomEvent('volunteer-availability-updated', {
                  detail: { isAvailable: this.myVolunteer.is_available },
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
              Swal.fire({
                icon: 'error',
                title: 'Update Failed',
                text: 'Failed to update availability. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#d33',
              });
            },
          });
      },
    });
  }

  toggleEdit(): void {
    if (this.isEditing) {
      // Save changes
      this.saveChanges();
    } else {
      // Enter edit mode
      this.isEditing = true;
    }
  }

  saveChanges(): void {
    // Validate form before saving
    if (!this.isFormValid()) {
      return;
    }

    Swal.fire({
      title: 'Save Changes',
      text: 'Are you sure you want to save the changes to your profile?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, save!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Saving Changes...',
          text: 'Please wait while we update your profile.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const profileData = {
          phone_no: this.studentProfile.phone,
        };

        this.authService.updateStudentProfile(profileData).subscribe({
          next: (response) => {
            this.originalProfile = { ...this.studentProfile };
            this.isEditing = false;

            Swal.fire({
              icon: 'success',
              title: 'Profile Updated!',
              text: 'Your profile has been updated successfully.',
              confirmButtonText: 'OK',
              confirmButtonColor: '#52796f',
            });
          },
          error: (error) => {
            console.error('Error updating profile:', error);
            // Revert changes on error
            this.studentProfile = { ...this.originalProfile };
            this.isEditing = false;

            Swal.fire({
              icon: 'error',
              title: 'Update Failed',
              text: 'Failed to update profile. Please try again.',
              confirmButtonText: 'OK',
              confirmButtonColor: '#52796f',
            });
          },
        });
      }
    });
  }

  isFormValid(): boolean {
    // Check if required fields are filled
    return true;
  }

  cancelEdit(): void {
    // Restore original values
    this.studentProfile = { ...this.originalProfile };
    this.isEditing = false;
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

  getInstallDescription(): string {
    if (this.isInstalled) {
      return 'HotBite is installed on your device. You can access it from your home screen or app drawer.';
    }
    if (this.canInstall) {
      return 'Install the app and get quick access to HotBite on your device.';
    }
    return 'App installation is not supported on this browser. You can continue using HotBite through your browser.';
  }

  openVolunteerTerms(): void {
    const modal = document.getElementById('volunteer-terms-modal');
    if (modal) modal.classList.add('show');
  }

  closeVolunteerTerms(): void {
    const modal = document.getElementById('volunteer-terms-modal');
    if (modal) modal.classList.remove('show');
  }

  startEditingSchedule(): void {
    this.isEditingSchedule = true;
  }

  cancelEditingSchedule(): void {
    this.availabilitySchedule = { ...this.originalSchedule };
    this.isEditingSchedule = false;
  }

  saveSchedule(): void {
    // Validate that end time is after start time if both are set
    if (this.availabilitySchedule.startTime && this.availabilitySchedule.endTime) {
      const start = new Date(`2000-01-01T${this.availabilitySchedule.startTime}`);
      const end = new Date(`2000-01-01T${this.availabilitySchedule.endTime}`);
      if (end <= start) {
        Swal.fire({
          icon: 'error',
          title: 'Invalid Schedule',
          text: 'End time must be after start time.',
          confirmButtonText: 'OK',
          confirmButtonColor: '#d33',
        });
        return;
      }
    }

    Swal.fire({
      title: 'Save Schedule',
      text: 'Are you sure you want to save your availability schedule?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#52796f',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, save!',
      cancelButtonText: 'Cancel',
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading state
        Swal.fire({
          title: 'Saving Schedule...',
          text: 'Please wait while we update your availability schedule.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          },
        });

        const token = this.authService.getToken('student');
        const headers = { Authorization: `Bearer ${token}` } as any;

        // Prepare the schedule times - convert empty strings to null
        const startTime = this.availabilitySchedule.startTime && this.availabilitySchedule.startTime.trim() !== '' 
          ? this.availabilitySchedule.startTime 
          : null;
        const endTime = this.availabilitySchedule.endTime && this.availabilitySchedule.endTime.trim() !== '' 
          ? this.availabilitySchedule.endTime 
          : null;

        // Log what we're sending for debugging
        console.log('Saving schedule:', {
          is_available: this.myVolunteer.is_available || false,
          availability_start_time: startTime,
          availability_end_time: endTime
        });

        this.http
          .put(
            `${this.apiUrl}/volunteers/availability`,
            {
              is_available: this.myVolunteer.is_available || false,
              availability_start_time: startTime,
              availability_end_time: endTime,
            },
            { headers }
          )
          .subscribe({
            next: (res: any) => {
              console.log('Schedule save response:', res);
              // Update the state from the response to ensure sync
              this.myVolunteer.availability_start_time = res?.availability_start_time || null;
              this.myVolunteer.availability_end_time = res?.availability_end_time || null;
              this.availabilitySchedule = {
                startTime: res?.availability_start_time || '',
                endTime: res?.availability_end_time || '',
              };
              this.originalSchedule = { ...this.availabilitySchedule };
              this.isEditingSchedule = false;

              // Verify the schedule was actually saved
              if (res?.availability_start_time || res?.availability_end_time) {
                console.log('Schedule successfully saved to database');
              } else {
                console.warn('Warning: Schedule times are null in response');
              }

              Swal.fire({
                icon: 'success',
                title: 'Schedule Saved!',
                text: 'Your availability schedule has been updated successfully.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#52796f',
              });
            },
            error: (err) => {
              console.error('Error saving schedule:', err);
              console.error('Error details:', {
                status: err?.status,
                statusText: err?.statusText,
                error: err?.error,
                message: err?.error?.message,
                code: err?.error?.code
              });
              Swal.fire({
                icon: 'error',
                title: 'Save Failed',
                text: err?.error?.message || err?.error?.error || 'Failed to save schedule. Please check the browser console for details.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#d33',
              });
            },
          });
      }
    });
  }

  formatTime(time: string | null | undefined): string {
    if (!time) return '';
    // Convert 24-hour format to 12-hour AM/PM format
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }
}
