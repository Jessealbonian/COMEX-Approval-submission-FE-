import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface AccountData {
  id: string;
  email: string;
  name: string;
  userLevel: string;
}

@Component({
  selector: 'app-account',
  imports: [CommonModule, FormsModule],
  templateUrl: './account.html',
  styleUrl: './account.css',
})
export class Account {
  isModalOpen = false;
  accounts: AccountData[] = [
    { id: 'AUTO-2026-0001', email: 'teacher@school.edu', name: 'Smith, John', userLevel: 'Teacher' },
    { id: 'AUTO-2026-0002', email: 'coord@school.edu', name: 'Johnson, Mary', userLevel: 'Coord' },
    { id: 'AUTO-2026-0003', email: 'master@school.edu', name: 'Williams, Robert', userLevel: 'Master' },
  ];

  formData = {
    id: 'AUTO-2026-0004',
    email: '',
    name: '',
    password: '123',
    userLevel: 'Teacher',
  };

  openModal() {
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.resetForm();
  }

  resetForm() {
    this.formData = {
      id: `AUTO-2026-${String(this.accounts.length + 1).padStart(4, '0')}`,
      email: '',
      name: '',
      password: '123',
      userLevel: 'Teacher',
    };
  }

  createAccount() {
    if (this.formData.email && this.formData.name) {
      const newAccount: AccountData = {
        id: this.formData.id,
        email: this.formData.email,
        name: this.formData.name,
        userLevel: this.formData.userLevel,
      };
      this.accounts.push(newAccount);
      this.closeModal();
    }
  }
}
