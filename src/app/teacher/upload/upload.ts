import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AuthService } from '../../core/services/auth.service';
import { FileService } from '../../core/services/file.service';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload.html',
  styleUrl: './upload.css',
})
export class Upload implements OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  isDragging = false;
  selectedFile: globalThis.File | null = null;
  uploadError = '';

  title = '';
  description = '';
  /** DLP keeps the legacy chain; Examination uses Coordinator → Principal → Master. */
  documentType: 'dlp' | 'examination' = 'dlp';

  documentName = '';
  submittedBy = this.auth.user()?.name ?? 'You';
  submittedAt: Date | null = null;
  pdfUrl: SafeResourceUrl | null = null;

  readonly submitting = signal(false);
  readonly successMessage = signal('');

  private pdfObjectUrl: string | null = null;

  ngOnDestroy(): void {
    this.revokePdfObjectUrl();
  }

  triggerFilePicker(): void {
    this.uploadError = '';
    this.fileInput?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.handleSelectedFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.handleSelectedFile(file);
  }

  cancelSelection(): void {
    this.selectedFile = null;
    this.uploadError = '';
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  /**
   * Sends the selected PDF + metadata to the backend. The HttpClient
   * automatically sets `Content-Type: multipart/form-data; boundary=...`
   * when given a FormData payload, and the auth interceptor attaches
   * the JWT, so this single call works the same locally and across
   * different hosting environments.
   */
  submitUpload(): void {
    if (!this.selectedFile || this.submitting()) return;
    if (!this.title.trim()) {
      this.uploadError = 'Please enter a title.';
      return;
    }

    this.submitting.set(true);
    this.uploadError = '';
    this.successMessage.set('');

    this.fileService
      .upload(
        this.selectedFile,
        this.title.trim(),
        this.description.trim() || undefined,
        this.documentType
      )
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.documentName = res.file.original_name;
          this.submittedAt = new Date(res.file.created_at);
          this.setPdfPreview(this.selectedFile!);
          const msg =
            res.file.document_type === 'examination'
              ? 'Upload submitted. Examination document routed to the Coordinator.'
              : 'Upload submitted. DLP routed to the Coordinator.';
          this.successMessage.set(msg);
          this.title = '';
          this.description = '';
          this.documentType = 'dlp';
          this.cancelSelection();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.uploadError = this.describe(err);
        },
      });
  }

  goToDocuments(): void {
    void this.router.navigateByUrl('/teacher/documents');
  }

  private describe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) return 'Cannot reach the server. Please try again.';
      const body = err.error as { error?: string } | null;
      if (body && typeof body.error === 'string') return body.error;
      if (err.status === 413) return 'File is too large.';
      if (err.status === 401) return 'Your session expired. Please log in again.';
      if (err.status === 403) return 'You are not allowed to perform this action.';
      return `Upload failed (HTTP ${err.status}).`;
    }
    return 'Upload failed.';
  }

  private handleSelectedFile(file: globalThis.File): void {
    this.uploadError = '';
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.selectedFile = null;
      this.uploadError = 'Only PDF files are supported.';
      return;
    }
    this.selectedFile = file;
    if (!this.title) this.title = file.name.replace(/\.pdf$/i, '');
    this.setPdfPreview(file);
  }

  private setPdfPreview(file: Blob): void {
    this.revokePdfObjectUrl();
    this.pdfObjectUrl = URL.createObjectURL(file);
    this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl);
  }

  private revokePdfObjectUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
  }
}
