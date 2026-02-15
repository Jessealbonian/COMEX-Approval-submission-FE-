import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService, UserRecord } from '../../services/user.service';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, SidenavComponent, TopnavStaffComponent],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css',
})
export class UserManagementComponent implements OnInit {
  users: UserRecord[] = [];
  total = 0;
  page = 1;
  limit = 10;
  searchQuery = '';
  roleFilter: '' | 'student' | 'staff' | 'volunteer' = '';
  loading = false;
  error = '';

  // Modal state
  showFormModal = false;
  isEditing = false;
  form: any = {
    user_id: undefined,
    name: '',
    email: '',
    password: '',
    phone_no: '',
    role: 'student',
    status: 'approved',
  };

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.error = '';
    this.userService
      .listUsers({
        q: this.searchQuery,
        role: this.roleFilter,
        page: this.page,
        limit: this.limit,
      })
      .subscribe({
        next: (res) => {
          this.users = res.data;
          this.total = res.total;
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load users';
          this.loading = false;
        },
      });
  }

  onSearchChange() {
    this.page = 1;
    this.loadUsers();
  }

  onRoleFilterChange() {
    this.page = 1;
    this.loadUsers();
  }

  openCreateModal() {
    this.isEditing = false;
    this.showFormModal = true;
    this.form = {
      name: '',
      email: '',
      password: '',
      phone_no: '',
      role: 'student',
      status: 'approved',
    };
  }

  openEditModal(user: UserRecord) {
    this.isEditing = true;
    this.showFormModal = true;
    this.form = {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      password: '',
      phone_no: user.phone_no || '',
      role: user.role,
      status: user.status,
    };
  }

  closeFormModal() {
    this.showFormModal = false;
  }

  saveUser() {
    // Basic validations
    if (
      !this.form.name ||
      !this.form.email ||
      (!this.isEditing && !this.form.password)
    ) {
      Swal.fire('Invalid', 'Name, email, and password are required', 'warning');
      return;
    }
    if (
      this.form.phone_no &&
      !/^(\+?\d{10,15}|09\d{9})$/.test(
        String(this.form.phone_no).replace(/\s|-/g, '')
      )
    ) {
      Swal.fire('Invalid', 'Contact number format is invalid', 'warning');
      return;
    }

    if (this.isEditing) {
      const id = this.form.user_id;
      const payload: any = {
        name: this.form.name,
        email: this.form.email,
        phone_no: this.form.phone_no || undefined,
        role: this.form.role,
        status: this.form.status,
      };
      if (this.form.password) payload.password = this.form.password;
      this.userService.updateUser(id, payload).subscribe({
        next: () => {
          Swal.fire('Updated', 'User updated successfully', 'success');
          this.showFormModal = false;
          this.loadUsers();
        },
        error: (err) => {
          const msg =
            err?.status === 409
              ? 'Email already exists'
              : err?.error?.message || 'Failed to update user';
          Swal.fire('Error', msg, 'error');
        },
      });
    } else {
      this.userService
        .createUser({
          name: this.form.name,
          email: this.form.email,
          password: this.form.password,
          phone_no: this.form.phone_no || undefined,
          role: this.form.role,
          status: this.form.status,
        })
        .subscribe({
          next: () => {
            Swal.fire('Created', 'User created successfully', 'success');
            this.showFormModal = false;
            this.loadUsers();
          },
          error: (err) => {
            const msg =
              err?.status === 409
                ? 'Email already exists'
                : err?.error?.message || 'Failed to create user';
            Swal.fire('Error', msg, 'error');
          },
        });
    }
  }

  confirmDelete(user: UserRecord) {
    Swal.fire({
      title: 'Delete user?',
      text: `This will permanently remove ${user.name}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d33',
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.deleteUser(user.user_id).subscribe({
          next: () => {
            Swal.fire('Deleted', 'User deleted successfully', 'success');
            this.loadUsers();
          },
          error: (err) => {
            const msg =
              err?.status === 409
                ? 'User has related orders and cannot be deleted'
                : err?.error?.message || 'Failed to delete user';
            Swal.fire('Error', msg, 'error');
          },
        });
      }
    });
  }

  // Pagination methods
  getTotalPages(): number {
    return Math.ceil(this.total / this.limit);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.getTotalPages()) {
      this.page = page;
      this.loadUsers();
    }
  }

  getPageNumbers(): number[] {
    const totalPages = this.getTotalPages();
    const pages: number[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show pages around current page
      let startPage = Math.max(1, this.page - 2);
      let endPage = Math.min(totalPages, this.page + 2);

      // Adjust if we're near the start or end
      if (this.page <= 3) {
        endPage = maxPagesToShow;
      } else if (this.page >= totalPages - 2) {
        startPage = totalPages - maxPagesToShow + 1;
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  // Make Math available in template
  Math = Math;
}
