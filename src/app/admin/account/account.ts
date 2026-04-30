import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { ManagedUser, UserService } from '../../core/services/user.service';
import { RoleLevel } from '../../core/models/auth.models';

type LevelLabel = 'Teacher' | 'Coord' | 'Master';

const LABEL_TO_LEVEL: Record<LevelLabel, RoleLevel> = {
  Teacher: 1,
  Coord: 2,
  Master: 3,
};

const LEVEL_TO_LABEL: Record<number, LevelLabel | 'Principal'> = {
  1: 'Teacher',
  2: 'Coord',
  3: 'Master',
  4: 'Principal',
};

interface AccountRow {
  id: number;
  email: string;
  name: string;
  userLevel: string;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account implements OnInit {
  private readonly userService = inject(UserService);

  isModalOpen = false;
  accounts: AccountRow[] = [];

  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  formData = {
    email: '',
    name: '',
    password: '',
    userLevel: 'Teacher' as LevelLabel,
  };

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.userService.list().subscribe({
      next: (res) => {
        this.loading.set(false);
        this.accounts = res.users.map<AccountRow>((u: ManagedUser) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          userLevel: LEVEL_TO_LABEL[u.role_level] ?? 'User',
        }));
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err, 'Failed to load accounts.'));
      },
    });
  }

  openModal(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.resetForm();
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  resetForm(): void {
    this.formData = {
      email: '',
      name: '',
      password: this.suggestPassword(),
      userLevel: 'Teacher',
    };
  }

  createAccount(): void {
    const { email, name, password, userLevel } = this.formData;

    if (!email.trim() || !name.trim() || !password) {
      this.errorMessage.set('Email, name and password are required.');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      this.errorMessage.set('Password must be at least 8 characters and contain letters and digits.');
      return;
    }

    this.creating.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.userService
      .create({
        email: email.trim(),
        name: name.trim(),
        password,
        role_level: LABEL_TO_LEVEL[userLevel],
      })
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.successMessage.set(`Created account for ${name.trim()}.`);
          this.closeModal();
          this.loadAccounts();
        },
        error: (err) => {
          this.creating.set(false);
          this.errorMessage.set(this.describe(err, 'Failed to create account.'));
        },
      });
  }

  private describe(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      return `${fallback} (HTTP ${err.status}).`;
    }
    return fallback;
  }

  private suggestPassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    const random =
      typeof crypto !== 'undefined' && crypto.getRandomValues
        ? () => {
            const arr = new Uint8Array(12);
            crypto.getRandomValues(arr);
            return Array.from(arr, (b) => alphabet[b % alphabet.length]).join('');
          }
        : () => {
            for (let i = 0; i < 12; i++) {
              s += alphabet[Math.floor(Math.random() * alphabet.length)];
            }
            return s;
          };
    return random();
  }
}
