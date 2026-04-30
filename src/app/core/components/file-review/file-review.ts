import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AuthService } from '../../services/auth.service';
import { FileService } from '../../services/file.service';
import { RoleLevel } from '../../models/auth.models';
import { FileComment, FileDoc } from '../../models/file.models';

/**
 * Shared "view a file + its comment timeline + (optionally) act on it"
 * component used by every role's file page.
 *
 * Behavior:
 *   - Loads file metadata + comments from the backend.
 *   - Streams the PDF using HttpClient so the JWT auth interceptor can
 *     attach the bearer token (a plain <iframe src=...> can't do that).
 *   - Decides on its own which action buttons to show, based on the
 *     logged-in user's role AND the file's current_level. The backend
 *     re-validates these conditions, so even a tampered button click
 *     cannot trigger an out-of-role action.
 */
@Component({
  selector: 'app-file-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-review.html',
  styleUrl: './file-review.css',
})
export class FileReview implements OnChanges, OnDestroy {
  @Input({ required: true }) fileId!: number | null;

  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly acting = signal(false);

  file: FileDoc | null = null;
  comments: FileComment[] = [];

  pdfUrl: SafeResourceUrl | null = null;
  private pdfObjectUrl: string | null = null;

  commentBody = '';

  ngOnChanges(changes: SimpleChanges): void {
    if ('fileId' in changes) {
      const next = changes['fileId'].currentValue as number | null;
      if (next != null && Number.isFinite(next) && next > 0) {
        this.load(next);
      } else {
        this.reset();
        this.errorMessage.set('No document selected.');
      }
    }
  }

  ngOnDestroy(): void {
    this.revokePdf();
  }

  /* -------- loading -------- */

  load(id: number): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.fileService.get(id).subscribe({
      next: (res) => {
        this.file = res.file;
        this.comments = res.comments;
        this.loading.set(false);
        this.refreshPdf(id);
      },
      error: (err) => {
        this.loading.set(false);
        this.reset();
        this.errorMessage.set(this.describe(err, 'Failed to load document.'));
      },
    });
  }

  private refreshPdf(id: number): void {
    this.revokePdf();
    this.fileService.download(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.pdfObjectUrl = url;
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      },
      error: () => {
        // Non-fatal: metadata still shows, just no PDF preview.
        this.pdfUrl = null;
      },
    });
  }

  /* -------- actions (the backend gates these on every call) -------- */

  postComment(): void {
    if (!this.file || this.acting()) return;
    const body = this.commentBody.trim();
    if (!body) {
      this.errorMessage.set('Please write a comment first.');
      return;
    }
    this.runAction(
      () =>
        this.fileService.comment(this.file!.id, body, 'comment').toPromise(),
      'Comment posted.'
    );
  }

  postRevision(): void {
    if (!this.file || this.acting()) return;
    const body = this.commentBody.trim();
    if (!body) {
      this.errorMessage.set('Please describe the revision first.');
      return;
    }
    this.runAction(
      () =>
        this.fileService.comment(this.file!.id, body, 'revision').toPromise(),
      'Revision request posted.'
    );
  }

  forward(): void {
    if (!this.file || this.acting()) return;
    const body = this.commentBody.trim() || undefined;
    this.runAction(
      () => this.fileService.forward(this.file!.id, body).toPromise(),
      'Forwarded to the next reviewer.'
    );
  }

  finalize(): void {
    if (!this.file || this.acting()) return;
    const body = this.commentBody.trim() || undefined;
    this.runAction(
      () => this.fileService.finalize(this.file!.id, body).toPromise(),
      'Document finalized.'
    );
  }

  download(): void {
    if (!this.file) return;
    this.fileService.download(this.file.id).subscribe({
      next: (blob) => this.triggerDownload(blob, this.file!.original_name),
      error: (err) =>
        this.errorMessage.set(this.describe(err, 'Download failed.')),
    });
  }

  /* -------- view-model helpers -------- */

  get currentRole(): RoleLevel | null {
    return this.auth.roleLevel();
  }

  get isMyTurn(): boolean {
    const role = this.currentRole;
    if (!this.file || !role) return false;
    if (role === 4) return this.file.status !== 'finalized';
    return Number(this.file.current_level) === role;
  }

  get canComment(): boolean {
    const role = this.currentRole;
    return !!role && role >= 2 && this.isMyTurn;
  }

  get canForward(): boolean {
    const role = this.currentRole;
    return !!role && (role === 2 || role === 3) && this.isMyTurn;
  }

  get canFinalize(): boolean {
    return this.currentRole === 4 && this.isMyTurn;
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'uploaded': return 'Awaiting Coordinator';
      case 'reviewed_by_coordinator': return 'With Master';
      case 'reviewed_by_master': return 'With Principal';
      case 'finalized': return 'Finalized';
      case 'returned': return 'Returned';
      default: return status;
    }
  }

  /* -------- internals -------- */

  private async runAction(
    op: () => Promise<unknown> | undefined,
    successMessage: string
  ): Promise<void> {
    if (!this.file) return;
    this.acting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    try {
      await op();
      this.successMessage.set(successMessage);
      this.commentBody = '';
      this.load(this.file.id);
    } catch (err) {
      this.errorMessage.set(this.describe(err, 'Action failed.'));
    } finally {
      this.acting.set(false);
    }
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private revokePdf(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
    this.pdfUrl = null;
  }

  private reset(): void {
    this.file = null;
    this.comments = [];
    this.revokePdf();
  }

  private describe(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      if (err.status === 401) return 'Your session expired. Please log in again.';
      if (err.status === 403) return 'You are not allowed to perform this action.';
      if (err.status === 404) return 'Document not found.';
      return `${fallback} (HTTP ${err.status}).`;
    }
    return fallback;
  }
}
