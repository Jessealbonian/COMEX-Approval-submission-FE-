import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
@Component({
  selector: 'app-topnav-staff',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './topnav-staff.component.html',
  styleUrl: './topnav-staff.component.css',
})
export class TopnavStaffComponent implements OnInit {
  isDropdownOpen = false;
  // Replace with actual user logic as needed
  username = 'Canteen Staff';

  constructor(private router: Router) {}

  ngOnInit(): void {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.username =
          payload.name ||
          payload.fullName ||
          payload.username ||
          'Canteen Staff';
      } catch (e) {
        this.username = 'Canteen Staff';
      }
    }
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-section')) {
      this.isDropdownOpen = false;
    }
  }

  logout(event: Event) {
    event.preventDefault();
    sessionStorage.removeItem('staff_token');
    this.router.navigate(['/home']);
  }
}
