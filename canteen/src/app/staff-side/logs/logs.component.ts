import { Component, OnInit } from '@angular/core';
import { TopnavStaffComponent } from '../../components/topnav-staff/topnav-staff.component';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [TopnavStaffComponent, SidenavComponent, CommonModule, FormsModule],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.css',
})
export class LogsComponent implements OnInit {
  apiUrl = environment.apiUrl;
  staffLogs: any[] = [];
  volunteerLogs: any[] = [];
  studentLogs: any[] = [];
  activeTab: 'staff' | 'volunteer' | 'student' = 'staff';

  // Search and filter properties
  searchTerm: string = '';
  selectedAction: string = '';
  availableActions: string[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadStaffLogs();
    this.loadVolunteerLogs();
    this.loadStudentLogs();
  }

  private staffHeaders() {
    const token =
      sessionStorage.getItem('staff_token') ||
      localStorage.getItem('staffToken');
    return { Authorization: `Bearer ${token}` } as any;
  }

  loadStaffLogs() {
    this.http
      .get(`${this.apiUrl}/logs/staff`, {
        headers: this.staffHeaders(),
      })
      .subscribe({
        next: (logs: any) => {
          this.staffLogs = (logs || []).filter(
            (log: any) => log.user_role !== 'volunteer'
          );
          this.updateAvailableActions();
        },
        error: (err) => console.error('Error loading staff logs:', err),
      });
  }

  loadVolunteerLogs() {
    this.http
      .get(`${this.apiUrl}/logs/staff`, {
        headers: this.staffHeaders(),
      })
      .subscribe({
        next: (logs: any) => {
          this.volunteerLogs = (logs || []).filter(
            (log: any) => log.user_role === 'volunteer'
          );
          this.updateAvailableActions();
        },
        error: (err) => console.error('Error loading volunteer logs:', err),
      });
  }

  loadStudentLogs() {
    this.http
      .get(`${this.apiUrl}/logs/student`, {
        headers: this.staffHeaders(),
      })
      .subscribe({
        next: (logs: any) => {
          this.studentLogs = logs || [];
          this.updateAvailableActions();
        },
        error: (err) => console.error('Error loading student logs:', err),
      });
  }

  switchTab(tab: 'staff' | 'volunteer' | 'student') {
    this.activeTab = tab;
    this.searchTerm = '';
    this.selectedAction = '';
  }

  getCurrentLogs() {
    let logs: any[] = [];
    switch (this.activeTab) {
      case 'staff':
        logs = this.staffLogs;
        break;
      case 'volunteer':
        logs = this.volunteerLogs;
        break;
      case 'student':
        logs = this.studentLogs;
        break;
    }
    return this.filterLogs(logs);
  }

  filterLogs(logs: any[]): any[] {
    let filteredLogs = logs;

    // Filter by search term
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase();
      filteredLogs = filteredLogs.filter(
        (log) =>
          log.user_name.toLowerCase().includes(searchLower) ||
          log.action.toLowerCase().includes(searchLower) ||
          (log.details && log.details.toLowerCase().includes(searchLower))
      );
    }

    // Filter by action
    if (this.selectedAction) {
      filteredLogs = filteredLogs.filter(
        (log) => log.action === this.selectedAction
      );
    }

    return filteredLogs;
  }

  updateAvailableActions() {
    const allLogs = [
      ...this.staffLogs,
      ...this.volunteerLogs,
      ...this.studentLogs,
    ];
    const actions = [...new Set(allLogs.map((log) => log.action))].sort();
    this.availableActions = actions;
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedAction = '';
  }

  formatTimestamp(timestamp: string) {
    return new Date(timestamp).toLocaleString();
  }
}
