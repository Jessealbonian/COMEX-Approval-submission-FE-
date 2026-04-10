import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import { SidenavComponent } from '../../components/sidenav/sidenav.component';

type DocComment = {
  author: string;
  message: string;
};

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SidenavComponent],
  templateUrl: './document.component.html',
  styleUrl: './document.component.css'
})
export class DocumentComponent implements OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  isDragging = false;
  uploadError = '';

  selectedFile: File | null = null;

  documentName = 'Name.pdf';
  submittedBy = 'Justin Marrocon Cortez';
  submittedAt = new Date('2026-02-01T00:00:00');

  private pdfObjectUrl: string | null = null;
  pdfUrl: SafeResourceUrl | null = null;

  private readonly allComments: DocComment[] = [
    { author: 'John Doe', message: 'Fix this' },
    { author: 'John Doe', message: 'Fix this' },
    { author: 'John Doe', message: 'Fix this' },
    { author: 'Jane Smith', message: 'Please re-check the signatures on page 2.' },
    { author: 'Mark Rivera', message: 'Use the latest template version for this submission.' },
    { author: 'John Doe', message: 'Please update the file name format: LASTNAME_FIRSTNAME.pdf' },
    { author: 'Admin', message: 'Ensure all required attachments are included before resubmitting.' },
    { author: 'Jane Smith', message: 'Looks good after the corrections. Thanks!' }
  ];

  visibleCommentsCount = 3;

  get visibleComments(): DocComment[] {
    return this.allComments.slice(0, this.visibleCommentsCount);
  }

  get canLoadMoreComments(): boolean {
    return this.visibleCommentsCount < this.allComments.length;
  }

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly router: Router
  ) {
    // Provide a default preview so the page looks complete without any backend.
    const sample = this.createSimplePdfBytes('Sample Template');
    this.setPdfPreview(new Blob([sample], { type: 'application/pdf' }));
  }

  ngOnDestroy(): void {
    this.revokePdfObjectUrl();
  }

  navigateHome(): void {
    void this.router.navigateByUrl('/home');
  }

  logout(): void {
    // Front-end only placeholder.
    try {
      localStorage.clear();
      sessionStorage.clear();
    } finally {
      void this.router.navigateByUrl('/home');
    }
  }

  triggerFilePicker(): void {
    this.uploadError = '';
    this.fileInput?.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
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
    if (!file) return;
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
    if (!this.selectedFile) return;
    this.documentName = this.selectedFile.name;
    this.submittedAt = new Date();
    this.setPdfPreview(this.selectedFile);
    this.cancelSelection();
  }

  loadMoreComments(): void {
    if (!this.canLoadMoreComments) return;
    this.visibleCommentsCount = Math.min(
      this.visibleCommentsCount + 3,
      this.allComments.length
    );
  }

  downloadSampleTemplate(): void {
    const bytes = this.createSimplePdfBytes('Sample Template');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'Sample-Template.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private handleSelectedFile(file: File): void {
    this.uploadError = '';

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.selectedFile = null;
      this.uploadError = 'Only PDF files are supported.';
      return;
    }

    this.selectedFile = file;
  }

  private setPdfPreview(fileOrBlob: Blob): void {
    this.revokePdfObjectUrl();
    this.pdfObjectUrl = URL.createObjectURL(fileOrBlob);
    this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      this.pdfObjectUrl
    );
  }

  private revokePdfObjectUrl(): void {
    if (!this.pdfObjectUrl) return;
    URL.revokeObjectURL(this.pdfObjectUrl);
    this.pdfObjectUrl = null;
  }

  private createSimplePdfBytes(text: string): Uint8Array {
    // Minimal PDF generator (single page, Helvetica). Computes xref offsets at runtime.
    const escapePdfString = (value: string) =>
      value
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)')
        .replaceAll('\n', ' ');

    const payload = escapePdfString(text);
    const stream = `BT\n/F1 20 Tf\n72 720 Td\n(${payload}) Tj\nET`;
    const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    const obj3 =
      `3 0 obj\n` +
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n` +
      `endobj\n`;
    const obj4 =
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
    const obj5 =
      `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

    // Keep header ASCII-only so string lengths match UTF-8 byte lengths.
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

    const trailer =
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;

    const pdf = parts.join('') + xref + trailer;
    return new TextEncoder().encode(pdf);
  }
}
