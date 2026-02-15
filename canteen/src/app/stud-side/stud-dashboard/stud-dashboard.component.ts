import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TopnavComponent } from '../../components/topnav/topnav.component';
import { FooterComponent } from '../../components/footer/footer.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stud-dashboard',
  standalone: true,
  imports: [TopnavComponent, FooterComponent],
  templateUrl: './stud-dashboard.component.html',
  styleUrl: './stud-dashboard.component.css',
})
export class StudDashboardComponent implements OnInit {
  canteenStatus: boolean = true;

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit() {
    this.checkCanteenStatus();
  }

  checkCanteenStatus() {
    this.http
      .get<{ isActive: boolean }>(`${environment.apiUrl}/api/canteen/status`)
      .subscribe({
        next: (data) => {
          this.canteenStatus = data.isActive;
          if (!this.canteenStatus) {
            this.showCanteenInactiveModal();
          }
        },
        error: (error) => {
          console.error('Error checking canteen status:', error);
        },
      });
  }

  showCanteenInactiveModal() {
    Swal.fire({
      title: 'Canteen Currently Inactive',
      text: 'The canteen is currently not accepting orders. Please check back later.',
      icon: 'info',
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'OK',
    });
  }

  navigateToPage(category?: string) {
    // Check canteen status before allowing navigation
    if (!this.canteenStatus) {
      this.showCanteenInactiveModal();
      return;
    }

    // Navigate to menu with optional category parameter
    if (category) {
      this.router.navigate(['/student/menu'], { queryParams: { category } });
    } else {
      this.router.navigate(['/student/menu']);
    }
  }
}
