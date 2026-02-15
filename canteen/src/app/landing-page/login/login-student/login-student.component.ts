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
  selector: 'app-login-student',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login-student.component.html',
  styleUrl: './login-student.component.css',
})
export class LoginStudentComponent {
  loginForm: FormGroup;
  errorMessage = '';
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      this.authService.login(this.loginForm.value, 'student').subscribe({
        next: (response: any) => {
          this.isLoading = false;
          if (
            response.user.role === 'student' ||
            response.user.role === 'volunteer'
          ) {
            this.router.navigate(['/student/stud-dashboard']);
          } else {
            this.errorMessage =
              'Access denied. Only students or volunteers can log in here.';
            // Only clear student token in this tab
            sessionStorage.removeItem('student_token');
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

  openTerms() {
    const modal = document.getElementById('terms-modal');
    if (modal) modal.classList.add('show');
  }

  closeTerms() {
    const modal = document.getElementById('terms-modal');
    if (modal) modal.classList.remove('show');
  }

  openPrivacy() {
    const modal = document.getElementById('privacy-modal');
    if (modal) modal.classList.add('show');
  }

  closePrivacy() {
    const modal = document.getElementById('privacy-modal');
    if (modal) modal.classList.remove('show');
  }
}
