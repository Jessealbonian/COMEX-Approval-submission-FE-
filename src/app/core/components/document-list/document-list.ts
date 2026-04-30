import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { FileService } from '../../services/file.service';
import { FileDoc, FileStatus } from '../../models/file.models';

interface ListRow {
  id: number;
  name: string;
  title: string;
  submittedBy: string;
  submittedOn: Date;
  status: FileStatus;
  statusLabel: string;
  currentLevel: number;
}

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-list.html',
  styleUrl: './document-list.css',
})
export class DocumentList implements OnInit {
  /** Where to navigate when a row is clicked. */
  @Input({ required: true }) detailRoute!: string;

  /**
   * Optional `mine=1` filter. Set true on a Teacher's "my documents"
   * page. Coordinator/Master/Admin should leave it false so they see
   * the queue assigned to them by the backend.
   */
  @Input() mineOnly = false;

  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);

  rows: ListRow[] = [];
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.fileService.list({ mine: this.mineOnly }).subscribe({
      next: (res) => {
        this.rows = res.files.map((f) => this.toRow(f));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  open(row: ListRow): void {
    void this.router.navigate([this.detailRoute], {
      queryParams: { id: row.id },
    });
  }

  private toRow(f: FileDoc): ListRow {
    return {
      id: f.id,
      name: f.original_name,
      title: f.title,
      submittedBy: f.uploaded_by.name,
      submittedOn: new Date(f.created_at),
      status: f.status,
      statusLabel: this.label(f.status),
      currentLevel: f.current_level,
    };
  }

  private label(status: FileStatus): string {
    switch (status) {
      case 'uploaded': return 'Awaiting Coordinator';
      case 'reviewed_by_coordinator': return 'With Master';
      case 'reviewed_by_master': return 'With Principal';
      case 'finalized': return 'Finalized';
      case 'returned': return 'Returned';
    }
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      return `Failed to load (HTTP ${err.status}).`;
    }
    return 'Failed to load.';
  }
}
