import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  FileComment,
  FileDoc,
  FileStatus,
  FileWithComments,
} from '../models/file.models';

@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/files`;

  upload(file: File, title: string, description?: string): Observable<{ file: FileDoc }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title);
    if (description) fd.append('description', description);
    return this.http.post<{ file: FileDoc }>(this.base, fd);
  }

  list(filters: {
    status?: FileStatus;
    current_level?: 1 | 2 | 3 | 4;
    mine?: boolean;
  } = {}): Observable<{ files: FileDoc[] }> {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.current_level) params = params.set('current_level', String(filters.current_level));
    if (filters.mine) params = params.set('mine', '1');
    return this.http.get<{ files: FileDoc[] }>(this.base, { params });
  }

  get(id: number): Observable<FileWithComments> {
    return this.http.get<FileWithComments>(`${this.base}/${id}`);
  }

  /**
   * Fetch the PDF as a Blob using HttpClient so the auth interceptor
   * can attach the JWT (browsers do not send Authorization headers
   * for plain <iframe src=...>). The caller turns the Blob into an
   * object URL for the preview iframe.
   */
  download(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/download`, {
      responseType: 'blob',
    });
  }

  downloadUrl(id: number): string {
    return `${this.base}/${id}/download`;
  }

  comment(
    fileId: number,
    body: string,
    action: 'comment' | 'revision' = 'comment'
  ): Observable<{ comment: FileComment }> {
    return this.http.post<{ comment: FileComment }>(
      `${this.base}/${fileId}/comments`,
      { body, action }
    );
  }

  forward(fileId: number, body?: string): Observable<{ ok: boolean; file: Partial<FileDoc> }> {
    return this.http.post<{ ok: boolean; file: Partial<FileDoc> }>(
      `${this.base}/${fileId}/forward`,
      { body }
    );
  }

  finalize(fileId: number, body?: string): Observable<{ ok: boolean; file: Partial<FileDoc> }> {
    return this.http.post<{ ok: boolean; file: Partial<FileDoc> }>(
      `${this.base}/${fileId}/finalize`,
      { body }
    );
  }
}
