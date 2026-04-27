import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-upload',
  imports: [CommonModule],
  templateUrl: './upload.html',
  styleUrl: './upload.css',
})
export class Upload implements OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  isDragging = false;
  selectedFile: globalThis.File | null = null;
  uploadError = '';
  documentName = 'Name.pdf';
  submittedBy = 'Justin Marrocon Cortez';
  submittedAt = new Date('2026-02-01T00:00:00');
  pdfUrl: SafeResourceUrl | null = null;

  private pdfObjectUrl: string | null = null;

  constructor(private readonly sanitizer: DomSanitizer) {
    this.setPdfPreview(this.createSimplePdfSource('Sample Template'));
  }

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
    const payload = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
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

    let xref = `xref\n0 6\n0000000000 65535 f \n`;
    for (let i = 1; i <= 5; i++) {
      xref += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
    }

    return `${parts.join('')}${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
  }
}
