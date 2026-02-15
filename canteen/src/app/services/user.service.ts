import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth.service';

export interface UserRecord {
  user_id: number;
  name: string;
  email: string;
  phone_no?: string;
  department?: string;
  role: 'student' | 'staff' | 'volunteer';
  status: 'active' | 'pending' | 'approved';
  created_at: string;
}

export interface PagedUsersResponse {
  data: UserRecord[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private apiUrl = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken('staff');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  listUsers(
    params: { q?: string; role?: string; page?: number; limit?: number } = {}
  ): Observable<PagedUsersResponse> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        httpParams = httpParams.set(k, String(v));
      }
    });
    return this.http.get<PagedUsersResponse>(`${this.apiUrl}`, {
      params: httpParams,
      headers: this.getAuthHeaders(),
    });
  }

  createUser(payload: {
    name: string;
    email: string;
    password: string;
    phone_no?: string;
    department?: string;
    role: 'student' | 'staff' | 'volunteer';
    status?: 'active' | 'pending' | 'approved';
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}`, payload, {
      headers: this.getAuthHeaders(),
    });
  }

  updateUser(
    id: number,
    payload: Partial<Omit<UserRecord, 'user_id' | 'created_at'>> & {
      password?: string;
    }
  ): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, payload, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }
}
