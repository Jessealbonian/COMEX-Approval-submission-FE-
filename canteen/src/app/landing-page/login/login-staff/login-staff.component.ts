import { Component } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../auth.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-login-staff',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login-staff.component.html',
  styleUrl: './login-staff.component.css',
})
export class LoginStaffComponent {
  loginForm: FormGroup;
  errorMessage = '';
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      this.authService.login(this.loginForm.value, 'staff').subscribe({
        next: (response: any) => {
          this.isLoading = false;
          if (response.user.role === 'staff') {
            this.router.navigate(['/staff/staff-dashboard']);
          } else {
            this.errorMessage = 'Access denied. Only staff can log in here.';
            // Only clear staff token in this tab
            sessionStorage.removeItem('staff_token');
          }
        },
        error: (error: any) => {
          this.isLoading = false;
          this.errorMessage =
            error.error.message ||
            'Login failed. Please check your credentials.';
        },
      });
    }
  }
}
