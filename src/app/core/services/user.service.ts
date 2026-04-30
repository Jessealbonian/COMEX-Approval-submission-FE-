import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser, RoleLevel } from '../models/auth.models';

export interface ManagedUser extends AuthUser {
  is_active: 0 | 1 | boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  list(roleLevel?: RoleLevel): Observable<{ users: ManagedUser[] }> {
    let params = new HttpParams();
    if (roleLevel) params = params.set('role_level', String(roleLevel));
    return this.http.get<{ users: ManagedUser[] }>(this.base, { params });
  }

  create(input: {
    name: string;
    email: string;
    password: string;
    role_level: RoleLevel;
  }): Observable<{ user: AuthUser }> {
    return this.http.post<{ user: AuthUser }>(this.base, input);
  }

  setActive(id: number, isActive: boolean): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.base}/${id}/active`, {
      is_active: isActive,
    });
  }
}
