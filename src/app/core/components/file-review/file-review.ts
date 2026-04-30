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
 *   - The PDF iframe is loaded ONCE per fileId. Posting a comment,
 *     revision, resolving, or forwarding does NOT re-fetch the PDF
 *     blob, so the user keeps their scroll position and zoom while
 *     interacting with the timeline.
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
  readonly resolvingId = signal<number | null>(null);

  file: FileDoc | null = null;
  comments: FileComment[] = [];

  pdfUrl: SafeResourceUrl | null = null;
  private pdfObjectUrl: string | null = null;
  /** id of the file whose blob currently sits in pdfObjectUrl, used to
   *  avoid redundant re-downloads when refreshing metadata only. */
  private pdfFileId: number | null = null;

  commentBody = '';

  ngOnChanges(changes: SimpleChanges): void {
    if ('fileId' in changes) {
      const next = changes['fileId'].currentValue as number | null;
      const prev = changes['fileId'].previousValue as number | null | undefined;
      if (next != null && Number.isFinite(next) && next > 0) {
        const fileChanged = prev !== next;
        this.load(next, { refreshPdf: fileChanged });
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

  /**
   * Load file metadata and comments. By default the PDF blob is only
   * fetched the first time we see this fileId; subsequent calls keep
   * the existing iframe alive (so the preview never flickers when
   * the user posts a comment / revision / resolves an item).
   */
  private load(id: number, opts: { refreshPdf?: boolean } = {}): void {
    const shouldFetchPdf = opts.refreshPdf || this.pdfFileId !== id;
    this.loading.set(true);
    this.errorMessage.set('');

    this.fileService.get(id).subscribe({
      next: (res) => {
        this.file = res.file;
        this.comments = res.comments;
        this.loading.set(false);
        if (shouldFetchPdf) this.refreshPdf(id);
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
        this.pdfFileId = id;
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      },
      error: () => {
        this.pdfUrl = null;
        this.pdfFileId = null;
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
      'Revision request posted. Forwarding is now blocked until it is resolved.'
    );
  }

  forward(): void {
    if (!this.file || this.acting()) return;
    if (this.hasUnresolvedRevisions) {
      this.errorMessage.set(
        'Cannot forward: there are unresolved revisions at your level. Resolve them first.'
      );
      return;
    }
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

  resolveComment(comment: FileComment): void {
    if (!this.file) return;
    if (comment.action !== 'revision' || comment.resolved_at) return;
    if (this.resolvingId() !== null) return;

    this.resolvingId.set(comment.id);
    this.errorMessage.set('');
    this.fileService.resolveComment(this.file.id, comment.id).subscribe({
      next: () => {
        this.resolvingId.set(null);
        this.successMessage.set('Revision marked as resolved.');
        // Metadata-only refresh: keep the PDF iframe untouched.
        if (this.file) this.load(this.file.id, { refreshPdf: false });
      },
      error: (err) => {
        this.resolvingId.set(null);
        this.errorMessage.set(this.describe(err, 'Failed to resolve revision.'));
      },
    });
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

  /**
   * Revisions raised by the *current reviewer's level* that are still
   * pending. While > 0 the Forward button is disabled (and the backend
   * also rejects forward attempts with 409).
   */
  get unresolvedAtMyLevel(): FileComment[] {
    const role = this.currentRole;
    if (!role) return [];
    return this.comments.filter(
      (c) =>
        c.action === 'revision' &&
        Number(c.role_level) === Number(role) &&
        !c.resolved_at
    );
  }

  get hasUnresolvedRevisions(): boolean {
    return this.unresolvedAtMyLevel.length > 0;
  }

  /**
   * The Resolve button is shown next to a revision if the logged-in
   * user is the reviewer who currently holds the file (Coordinator/
   * Master/Admin) AND the revision is not yet resolved.
   */
  canResolve(comment: FileComment): boolean {
    if (comment.action !== 'revision' || comment.resolved_at) return false;
    const role = this.currentRole;
    if (!role || role === 1) return false;
    return this.isMyTurn;
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
      // Metadata-only refresh: do NOT re-fetch the PDF blob, so the
      // iframe and the user's scroll/zoom remain untouched.
      this.load(this.file.id, { refreshPdf: false });
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
    this.pdfFileId = null;
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
      if (err.status === 409) return 'Action conflicts with current document state.';
      return `${fallback} (HTTP ${err.status}).`;
    }
    return fallback;
  }
}
