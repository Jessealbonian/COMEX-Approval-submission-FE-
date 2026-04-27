import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

type DocumentStatus = 'Pending' | 'Checked' | 'For Revision';

type DocRow = {
  id: string;
  name: string;
  submittedBy: string;
  submittedOn: Date;
  coordChecked: string;
  coordStatus: DocumentStatus;
  masterChecked: string;
  masterStatus: DocumentStatus;
  principalChecked: string;
  principalStatus: DocumentStatus;
  revisions: string;
};

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './documents.html',
  styleUrl: './documents.css',
})
export class Documents {
  rows: DocRow[] = [
    {
      id: 'TRX-2026-001',
      name: 'Name.pdf',
      submittedBy: 'Justin Marrocon Cortez',
      submittedOn: new Date('2026-02-01T00:00:00'),
      coordChecked: 'Maria Lopez',
      coordStatus: 'Checked',
      masterChecked: 'Kevin Santos',
      masterStatus: 'Checked',
      principalChecked: 'Dr. Reyes',
      principalStatus: 'For Revision',
      revisions: 'Update signature placement',
    },
    {
      id: 'TRX-2026-002',
      name: 'Enrollment-Form.pdf',
      submittedBy: 'Jane Smith',
      submittedOn: new Date('2026-01-22T00:00:00'),
      coordChecked: 'Anna Cruz',
      coordStatus: 'Pending',
      masterChecked: 'N/A',
      masterStatus: 'Pending',
      principalChecked: 'N/A',
      principalStatus: 'Pending',
      revisions: 'Awaiting first review',
    },
    {
      id: 'TRX-2026-003',
      name: 'Request-Letter.pdf',
      submittedBy: 'Mark Rivera',
      submittedOn: new Date('2026-01-10T00:00:00'),
      coordChecked: 'Maria Lopez',
      coordStatus: 'Checked',
      masterChecked: 'Kevin Santos',
      masterStatus: 'Checked',
      principalChecked: 'Dr. Reyes',
      principalStatus: 'Checked',
      revisions: 'Approved for release',
    },
  ];

  constructor(private readonly router: Router) {}

  navigateHome(): void {
    void this.router.navigateByUrl('/teacher/home');
  }

  openDocument(row: DocRow): void {
    void this.router.navigate(['/teacher/file'], { queryParams: { id: row.id } });
  }
}
