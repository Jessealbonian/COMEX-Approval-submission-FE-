import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  register(user: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/register`, user);
  }

  login(credentials: any, role: 'student' | 'staff'): Observable<any> {
    const loginUrl = `${this.apiUrl}/auth/login/${role}`;
    return this.http.post(loginUrl, credentials).pipe(
      tap((response: any) => {
        if (response?.token) {
          // Store tokens under role-specific keys to avoid overriding sessions
          const key = role === 'staff' ? 'staff_token' : 'student_token';
          sessionStorage.setItem(key, response.token);
        }
      })
    );
  }

  logout(): void {
    // Remove both tokens from session storage (per-tab)
    sessionStorage.removeItem('student_token');
    sessionStorage.removeItem('staff_token');
  }

  getToken(context?: 'student' | 'staff'): string | null {
    // Prefer sessionStorage for per-tab isolation; fallback to legacy keys for compatibility
    const studentKeys = ['student_token', 'studentToken'];
    const staffKeys = ['staff_token', 'staffToken'];

    const readKey = (keys: string[]) => {
      for (const k of keys) {
        const v = sessionStorage.getItem(k) || localStorage.getItem(k);
        if (v) return v;
      }
      return null;
    };

    if (context === 'staff') return readKey(staffKeys);
    if (context === 'student') return readKey(studentKeys);
    return readKey(studentKeys) || readKey(staffKeys);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getStudentProfile(): Observable<any> {
    const token = this.getToken('student');
    const headers = { Authorization: `Bearer ${token}` };
    return this.http.get(`${this.apiUrl}/auth/profile`, { headers });
  }

  updateStudentProfile(profileData: any): Observable<any> {
    const token = this.getToken('student');
    const headers = { Authorization: `Bearer ${token}` };
    return this.http.put(`${this.apiUrl}/auth/profile`, profileData, {
      headers,
    });
  }

  getCurrentUser(context?: 'student' | 'staff'): any {
    const token = this.getToken(context);
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
      } catch (e) {
        console.error('Error decoding token:', e);
        return null;
      }
    }
    return null;
  }
}
