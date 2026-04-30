export type RoleName = 'teacher' | 'coordinator' | 'master' | 'admin';
export type RoleLevel = 1 | 2 | 3 | 4;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  role_level: RoleLevel;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  redirect: string;
}

export interface ApiError {
  error: string;
  request_id?: string;
  details?: unknown;
}
