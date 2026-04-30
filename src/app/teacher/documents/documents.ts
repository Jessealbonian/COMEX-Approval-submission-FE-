import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { FileService } from '../../core/services/file.service';
import {
  CommentAction,
  FileComment,
  FileDoc,
  FileStatus,
} from '../../core/models/file.models';

type DocumentStatus = 'Pending' | 'Checked' | 'For Revision';

interface DocRow {
  id: number;
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
  status: FileStatus;
  current_level: number;
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './documents.html',
  styleUrl: './documents.css',
})
export class Documents implements OnInit {
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);

  rows: DocRow[] = [];
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadDocuments();
  }

  /**
   * Pulls the teacher's submissions from the backend (single source of
   * truth). Called on every navigation/refresh, so any change made by
   * a Coordinator/Master/Principal is reflected immediately.
   */
  loadDocuments(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.fileService.list({ mine: true }).subscribe({
      next: (res) => {
        const files = res.files;
        if (files.length === 0) {
          this.rows = [];
          this.loading.set(false);
          return;
        }

        // Fan out to fetch comments per file so we can compute
        // per-stage reviewer + status.
        const detailRequests = files.map((f) =>
          this.fileService.get(f.id).toPromise()
        );

        Promise.all(detailRequests)
          .then((details) => {
            this.rows = details
              .filter((d): d is { file: FileDoc; comments: FileComment[] } => !!d)
              .map((d) => this.toRow(d.file, d.comments));
            this.loading.set(false);
          })
          .catch((err) => {
            this.loading.set(false);
            this.errorMessage.set(this.describe(err));
          });
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.describe(err));
      },
    });
  }

  navigateHome(): void {
    void this.router.navigateByUrl('/teacher/home');
  }

  openDocument(row: DocRow): void {
    void this.router.navigate(['/teacher/file'], { queryParams: { id: row.id } });
  }

  private toRow(file: FileDoc, comments: FileComment[]): DocRow {
    const stage = (level: 2 | 3 | 4) => {
      const acted = comments.find((c) => c.role_level === level);
      const isCheckpoint = (a: CommentAction) =>
        a === 'forward' || a === 'finalize' || a === 'comment' || a === 'revision';
      const checkpoint = comments.find(
        (c) => c.role_level === level && isCheckpoint(c.action)
      );

      let status: DocumentStatus = 'Pending';
      if (file.current_level > level) {
        status = 'Checked';
      } else if (file.current_level === level) {
        const hasRevision = comments.some(
          (c) => c.role_level === level && c.action === 'revision'
        );
        status = hasRevision ? 'For Revision' : 'Pending';
      } else if (level === 4 && file.status === 'finalized') {
        status = 'Checked';
      }

      return {
        reviewer: (checkpoint ?? acted)?.user.name ?? 'N/A',
        status,
      };
    };

    const coord = stage(2);
    const master = stage(3);
    const principal = stage(4);
    if (file.status === 'finalized') {
      principal.status = 'Checked';
    }

    const revisions =
      comments
        .filter((c) => c.action === 'revision')
        .map((c) => `${c.role}: ${c.body}`)
        .join(' | ') || (file.status === 'finalized' ? 'Approved' : 'Awaiting review');

    return {
      id: file.id,
      name: file.original_name,
      submittedBy: file.uploaded_by.name,
      submittedOn: new Date(file.created_at),
      coordChecked: coord.reviewer,
      coordStatus: coord.status,
      masterChecked: master.reviewer,
      masterStatus: master.status,
      principalChecked: principal.reviewer,
      principalStatus: principal.status,
      revisions,
      status: file.status,
      current_level: file.current_level,
    };
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      return `Failed to load documents (HTTP ${err.status}).`;
    }
    return 'Failed to load documents.';
  }
}
