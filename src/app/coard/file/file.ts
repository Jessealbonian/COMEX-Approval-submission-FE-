import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

type DocComment = {
  author: string;
  message: string;
};

type DocumentDetails = {
  id: string;
  name: string;
  submittedBy: string;
  submittedAt: Date;
  comments: DocComment[];
};

const DOCUMENTS: Record<string, DocumentDetails> = {
  'TRX-2026-001': {
    id: 'TRX-2026-001',
    name: 'Name.pdf',
    submittedBy: 'Justin Marrocon Cortez',
    submittedAt: new Date('2026-02-01T00:00:00'),
    comments: [
      { author: 'John Doe', message: 'Fix this' },
      { author: 'John Doe', message: 'Fix this' },
      { author: 'John Doe', message: 'Fix this' },
      { author: 'Jane Smith', message: 'Please re-check the signatures on page 2.' },
      { author: 'Mark Rivera', message: 'Use the latest template version for this submission.' },
      { author: 'John Doe', message: 'Please update the file name format: LASTNAME_FIRSTNAME.pdf' },
      { author: 'Admin', message: 'Ensure all required attachments are included before resubmitting.' },
      { author: 'Jane Smith', message: 'Looks good after the corrections. Thanks!' },
    ],
  },
  'TRX-2026-002': {
    id: 'TRX-2026-002',
    name: 'Enrollment-Form.pdf',
    submittedBy: 'Jane Smith',
    submittedAt: new Date('2026-01-22T00:00:00'),
    comments: [
      { author: 'Anna Cruz', message: 'Pending coordinator review.' },
      { author: 'Records Office', message: 'Please include the back page in one file.' },
      { author: 'Admin', message: 'Awaiting first review cycle.' },
    ],
  },
  'TRX-2026-003': {
    id: 'TRX-2026-003',
    name: 'Request-Letter.pdf',
    submittedBy: 'Mark Rivera',
    submittedAt: new Date('2026-01-10T00:00:00'),
    comments: [
      { author: 'Maria Lopez', message: 'Coordinator check complete.' },
      { author: 'Kevin Santos', message: 'Master check complete.' },
      { author: 'Dr. Reyes', message: 'Approved for release.' },
    ],
  },
};

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file.html',
  styleUrl: './file.css',
})
export class Files implements OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  isDragging = false;
  uploadError = '';
  selectedFile: globalThis.File | null = null;

  documentName = 'Name.pdf';
  submittedBy = 'Justin Marrocon Cortez';
  submittedAt = new Date('2026-02-01T00:00:00');

  private pdfObjectUrl: string | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  currentDocumentId = 'TRX-2026-001';
  private routeSub?: Subscription;
  private allComments: DocComment[] = [
    { author: 'John Doe', message: 'Fix this' },
    { author: 'John Doe', message: 'Fix this' },
    { author: 'John Doe', message: 'Fix this' },
    { author: 'Jane Smith', message: 'Please re-check the signatures on page 2.' },
    { author: 'Mark Rivera', message: 'Use the latest template version for this submission.' },
    { author: 'John Doe', message: 'Please update the file name format: LASTNAME_FIRSTNAME.pdf' },
    { author: 'Admin', message: 'Ensure all required attachments are included before resubmitting.' },
    { author: 'Jane Smith', message: 'Looks good after the corrections. Thanks!' },
  ];

  visibleCommentsCount = 3;

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.setPdfPreview(this.createSimplePdfSource('Sample Template'));
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const id = params.get('id');
      this.setCurrentDocument(id);
    });
  }

  get visibleComments(): DocComment[] {
    return this.allComments.slice(0, this.visibleCommentsCount);
  }

  get canLoadMoreComments(): boolean {
    return this.visibleCommentsCount < this.allComments.length;
  }

  navigateHome(): void {
    void this.router.navigateByUrl('/coard/dashboard');
  }

  backToDocuments(): void {
    void this.router.navigateByUrl('/coard/document');
  }

  triggerFilePicker(): void {
    this.uploadError = '';
    this.fileInput?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.handleSelectedFile(file);
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
    if (!file) {
      return;
    }

    this.handleSelectedFile(file);
  }

  cancelSelection(): void {
    this.selectedFile = null;
    this.uploadError = '';

    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  continueSelection(): void {
    if (!this.selectedFile) {
      return;
    }

    this.documentName = this.selectedFile.name;
    this.submittedAt = new Date();
    this.setPdfPreview(this.selectedFile);
    this.cancelSelection();
  }

  loadMoreComments(): void {
    if (!this.canLoadMoreComments) {
      return;
    }

    this.visibleCommentsCount = Math.min(this.visibleCommentsCount + 3, this.allComments.length);
  }

  downloadSampleTemplate(): void {
    const blob = new Blob([this.createSimplePdfSource('Sample Template')], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Sample-Template.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.revokePdfObjectUrl();
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
  }

  private setPdfPreview(fileOrSource: BlobPart): void {
    this.revokePdfObjectUrl();
    this.pdfObjectUrl = URL.createObjectURL(new Blob([fileOrSource], { type: 'application/pdf' }));
    this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl);
  }

  private revokePdfObjectUrl(): void {
    if (!this.pdfObjectUrl) {
      return;
    }

    URL.revokeObjectURL(this.pdfObjectUrl);
    this.pdfObjectUrl = null;
  }

  private createSimplePdfSource(text: string): string {
    const escapePdfString = (value: string) =>
      value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('\n', ' ');

    const payload = escapePdfString(text);
    const stream = `BT\n/F1 20 Tf\n72 720 Td\n(${payload}) Tj\nET`;
    const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    const obj3 =
      `3 0 obj\n` +
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n` +
      `endobj\n`;
    const obj4 = `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
    const obj5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

    const header = `%PDF-1.4\n%----\n`;
    const parts = [header, obj1, obj2, obj3, obj4, obj5];

    const offsets: number[] = [0];
    let cursor = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0) {
        cursor += part.length;
        continue;
      }

      offsets[i] = cursor;
      cursor += part.length;
    }

    const pad10 = (n: number) => String(n).padStart(10, '0');
    let xref = `xref\n0 6\n`;
    xref += `0000000000 65535 f \n`;
    for (let i = 1; i <= 5; i++) {
      xref += `${pad10(offsets[i] ?? 0)} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
    return parts.join('') + xref + trailer;
  }

  private setCurrentDocument(id: string | null): void {
    const fallbackId = 'TRX-2026-001';
    const resolvedId = id && DOCUMENTS[id] ? id : fallbackId;
    const document = DOCUMENTS[resolvedId];

    this.currentDocumentId = document.id;
    this.documentName = document.name;
    this.submittedBy = document.submittedBy;
    this.submittedAt = document.submittedAt;
    this.allComments = document.comments;
    this.visibleCommentsCount = Math.min(3, this.allComments.length);
    this.setPdfPreview(this.createSimplePdfSource(document.name));
  }
}
