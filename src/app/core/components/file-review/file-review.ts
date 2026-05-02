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
import {
  FileComment,
  FileDoc,
  documentTypeLabel,
  workflowStageLabel,
  workflowStatusTone,
} from '../../models/file.models';

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

  readonly docTypeLabel = documentTypeLabel;
  readonly stageLabel = workflowStageLabel;
  readonly statusTone = workflowStatusTone;

  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly acting = signal(false);
  readonly resolvingId = signal<number | null>(null);
  readonly pdfLoading = signal(false);
  readonly pdfError = signal('');
  readonly fullscreen = signal(false);

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
    this.pdfLoading.set(true);
    this.pdfError.set('');
    this.fileService.download(id).subscribe({
      next: (blob) => {
        // Force the correct MIME so Chrome's built-in viewer kicks in
        // even if the server response was missing or wrong.
        const pdfBlob =
          blob.type === 'application/pdf'
            ? blob
            : new Blob([blob], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        this.pdfObjectUrl = url;
        this.pdfFileId = id;
        this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        this.pdfLoading.set(false);
      },
      error: (err) => {
        this.pdfUrl = null;
        this.pdfFileId = null;
        this.pdfLoading.set(false);
        this.pdfError.set(this.describe(err, 'Could not load the PDF.'));
      },
    });
  }

  retryPdf(): void {
    if (this.file) this.refreshPdf(this.file.id);
  }

  toggleFullscreen(): void {
    this.fullscreen.update((v) => !v);
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
    if (this.hasAnyUnresolvedRevisions) {
      this.errorMessage.set(
        'Cannot forward: there are unresolved revisions on this document. Resolve them first.'
      );
      return;
    }
    const body = this.commentBody.trim() || undefined;
    const success =
      this.file.document_type === 'examination' &&
      this.currentRole === 3 &&
      this.file.status === 'exam_master'
        ? 'Document completed (finalized).'
        : 'Forwarded to the next reviewer.';
    this.runAction(
      () => this.fileService.forward(this.file!.id, body).toPromise(),
      success
    );
  }

  finalize(): void {
    if (!this.file || this.acting()) return;
    if (this.hasAnyUnresolvedRevisions) {
      this.errorMessage.set(
        'Cannot finalize: there are unresolved revisions on this document. Resolve them first.'
      );
      return;
    }
    const body = this.commentBody.trim() || undefined;
    this.runAction(
      () => this.fileService.finalize(this.file!.id, body).toPromise(),
      'Document finalized.'
    );
  }

  /**
   * Teacher-side handler for the file picker. Uploads the chosen PDF
   * to /reupload, which keeps the same transaction id but rolls the
   * workflow back to Coordinator. After the upload finishes we fully
   * reload metadata + comments AND fetch the new PDF blob so the
   * preview reflects the replacement.
   */
  onReuploadFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file || !this.file || this.acting()) {
      if (input) input.value = '';
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.errorMessage.set('Please choose a PDF file.');
      input.value = '';
      return;
    }
    const fileId = this.file.id;
    this.runAction(
      () => this.fileService.reupload(fileId, file).toPromise(),
      'Document re-uploaded. It is now back with the Coordinator.',
      { refreshPdf: true }
    );
    input.value = '';
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
    if (role === 4) {
      if (this.file.status === 'finalized') return false;
      return Number(this.file.current_level) === role;
    }
    return Number(this.file.current_level) === role;
  }

  get canComment(): boolean {
    const role = this.currentRole;
    return !!role && role >= 2 && this.isMyTurn;
  }

  get canForward(): boolean {
    const role = this.currentRole;
    if (!this.file || !role) return false;
    if (role === 4) return false;
    return (role === 2 || role === 3) && this.isMyTurn;
  }

  get canFinalize(): boolean {
    if (this.currentRole !== 4 || !this.file) return false;
    if (!this.isMyTurn) return false;
    if ((this.file.document_type ?? 'dlp') === 'examination') {
      return this.file.status === 'exam_principal';
    }
    return this.file.status === 'reviewed_by_master';
  }

  /**
   * Teacher can re-upload a replacement PDF on the same transaction
   * whenever a reviewer has flagged the document for revision and
   * those revisions are still open. Once Forward/Finalize go through,
   * there are no open revisions left, so the button hides itself.
   */
  get canReupload(): boolean {
    return this.currentRole === 1 && this.hasAnyUnresolvedRevisions;
  }

  /** Every revision on this document that is still unresolved. Any
   *  open revision blocks forwarding (Coordinator/Master) AND
   *  finalizing (Principal), regardless of which reviewer raised it. */
  get unresolvedRevisions(): FileComment[] {
    return this.comments.filter(
      (c) => c.action === 'revision' && !c.resolved_at
    );
  }

  get hasAnyUnresolvedRevisions(): boolean {
    return this.unresolvedRevisions.length > 0;
  }

  /**
   * Revisions raised by the *current reviewer's level* that are still
   * pending. Used only for the Resolve UI; the gating logic uses
   * hasAnyUnresolvedRevisions instead.
   */
  get unresolvedAtMyLevel(): FileComment[] {
    const role = this.currentRole;
    if (!role) return [];
    return this.unresolvedRevisions.filter(
      (c) => Number(c.role_level) === Number(role)
    );
  }

  get hasUnresolvedRevisions(): boolean {
    return this.hasAnyUnresolvedRevisions;
  }

  /**
   * Forward label: legacy Examination rows at Master still complete via forward.
   */
  get forwardButtonLabel(): string {
    if (!this.file) return 'Forward to next level';
    if (
      this.file.document_type === 'examination' &&
      this.currentRole === 3 &&
      this.file.status === 'exam_master'
    ) {
      return 'Approve and complete';
    }
    return 'Forward to next level';
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

  /* -------- internals -------- */

  private async runAction(
    op: () => Promise<unknown> | undefined,
    successMessage: string,
    opts: { refreshPdf?: boolean } = {}
  ): Promise<void> {
    if (!this.file) return;
    this.acting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    try {
      await op();
      this.successMessage.set(successMessage);
      this.commentBody = '';
      // By default this is a metadata-only refresh so the iframe
      // and the user's scroll/zoom remain untouched. Re-upload sets
      // refreshPdf:true so the preview shows the replacement file.
      this.load(this.file.id, { refreshPdf: !!opts.refreshPdf });
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
