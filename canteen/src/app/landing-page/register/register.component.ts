import { Component } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../auth.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  registerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.pattern(/^[a-zA-Z\s]+$/)]],
        email: ['', [Validators.required, this.emailValidator]],
        phone_no: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            this.passwordStrengthValidator,
          ],
        ],
        confirmPassword: ['', Validators.required],
        agreeToTerms: [false, Validators.requiredTrue],
      },
      { validator: this.passwordMatchValidator }
    );
  }

  // Custom email validator with better regex
  emailValidator(control: AbstractControl): ValidationErrors | null {
    const email = control.value;
    if (!email) return null;

    const emailRegex = /^\d{9}@gordoncollege\.edu\.ph$/;
    return emailRegex.test(email) ? null : { invalidEmail: true };
  }

  // Password strength validator
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.value;
    if (!password) return null;

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors: ValidationErrors = {};

    if (!hasUpperCase) errors['missingUpperCase'] = true;
    if (!hasLowerCase) errors['missingLowerCase'] = true;
    if (!hasNumbers) errors['missingNumbers'] = true;
    if (!hasSpecialChar) errors['missingSpecialChar'] = true;

    return Object.keys(errors).length > 0 ? errors : null;
  }

  passwordMatchValidator(form: FormGroup): ValidationErrors | null {
    return form.get('password')?.value === form.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  getValidationErrors(): string[] {
    const errors: string[] = [];
    const controls = this.registerForm.controls;

    // Check each field for specific validation errors
    if (controls['name'].errors) {
      if (controls['name'].errors['required']) {
        errors.push('Full Name is required');
      } else if (controls['name'].errors['pattern']) {
        errors.push('Full Name can only contain letters and spaces');
      }
    }

    if (controls['email'].errors) {
      if (controls['email'].errors['required']) {
        errors.push('Email is required');
      } else if (controls['email'].errors['invalidEmail']) {
        errors.push(
          'Email must be a valid Gordon College student email (e.g., 202012233@gordoncollege.edu.ph)'
        );
      }
    }

    if (controls['phone_no'].errors) {
      if (controls['phone_no'].errors['required']) {
        errors.push('Phone Number is required');
      } else if (controls['phone_no'].errors['pattern']) {
        errors.push('Phone Number must be exactly 11 digits');
      }
    }

    if (controls['password'].errors) {
      if (controls['password'].errors['required']) {
        errors.push('Password is required');
      } else if (controls['password'].errors['minlength']) {
        errors.push('Password must be at least 8 characters long');
      } else {
        // Combine all password strength requirements into one message
        const passwordErrors = controls['password'].errors;
        const missingRequirements = [];

        if (passwordErrors['missingUpperCase']) {
          missingRequirements.push('uppercase letter');
        }
        if (passwordErrors['missingLowerCase']) {
          missingRequirements.push('lowercase letter');
        }
        if (passwordErrors['missingNumbers']) {
          missingRequirements.push('number');
        }
        if (passwordErrors['missingSpecialChar']) {
          missingRequirements.push('special character (!@#$%^&*)');
        }

        if (missingRequirements.length > 0) {
          const requirementsText = missingRequirements.join(', ');
          errors.push(`Password must contain at least one ${requirementsText}`);
        }
      }
    }

    if (controls['confirmPassword'].errors) {
      if (controls['confirmPassword'].errors['required']) {
        errors.push('Confirm Password is required');
      }
    }

    // Check for password mismatch
    if (this.registerForm.errors && this.registerForm.errors['mismatch']) {
      errors.push('Passwords do not match');
    }

    // Check for terms agreement
    if (controls['agreeToTerms'].errors) {
      if (controls['agreeToTerms'].errors['required']) {
        errors.push(
          'You must agree to the Terms and Conditions and Data Privacy Waiver'
        );
      }
    }

    return errors;
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      const { confirmPassword, agreeToTerms, ...formData } =
        this.registerForm.value;
      const registrationData = {
        ...formData,
        role: 'student',
      };

      // Show loading state
      Swal.fire({
        title: 'Creating Account...',
        text: 'Please wait while we create your account.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      this.authService.register(registrationData).subscribe({
        next: (response: any) => {
          console.log('Registration successful', response);
          Swal.close(); // Close loading modal
          Swal.fire({
            icon: 'success',
            title: 'Registration Successful!',
            text: 'Your account has been created successfully. You can now login.',
            confirmButtonText: 'Continue to Login',
            confirmButtonColor: '#3085d6',
          }).then((result) => {
            if (result.isConfirmed) {
              this.router.navigate(['/login/student']);
            }
          });
        },
        error: (error: any) => {
          const errorMsg =
            error.error.message || 'Registration failed. Please try again.';
          Swal.close(); // Close loading modal
          Swal.fire({
            icon: 'error',
            title: 'Registration Failed',
            text: errorMsg,
            confirmButtonText: 'OK',
            confirmButtonColor: '#d33',
          });
          console.error('Registration failed', error);
        },
      });
    } else {
      // Get specific validation errors
      const validationErrors = this.getValidationErrors();

      // Show validation errors with detailed messages
      Swal.fire({
        icon: 'warning',
        title: 'Form Validation Error',
        html: `
          <div style="text-align: left;">
            <p style="margin-bottom: 10px;">Please fix the following errors:</p>
            <ul style="text-align: left; margin: 0; padding-left: 20px;">
              ${validationErrors
                .map((error) => `<li style="margin-bottom: 5px;">${error}</li>`)
                .join('')}
            </ul>
          </div>
        `,
        confirmButtonText: 'OK',
        confirmButtonColor: '#f39c12',
        width: '500px',
      });
    }
  }

  // Terms modal trigger
  openTerms(): void {
    const modal = document.getElementById('terms-modal');
    if (modal) {
      modal.classList.add('show');
    }
  }

  closeTerms(): void {
    const modal = document.getElementById('terms-modal');
    if (modal) modal.classList.remove('show');
  }

  // Privacy modal trigger
  openPrivacy(): void {
    const modal = document.getElementById('privacy-modal');
    if (modal) {
      modal.classList.add('show');
    }
  }

  closePrivacy(): void {
    const modal = document.getElementById('privacy-modal');
    if (modal) modal.classList.remove('show');
  }
}
