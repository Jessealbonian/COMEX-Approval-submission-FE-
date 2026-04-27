import { Routes } from '@angular/router';

import { Dashboard } from './admin/dashboard/dashboard';
import { Document } from './admin/document/document';
import { Files } from './admin/files/files';
import { Login as AdminLogin } from './admin/login/login';
import { Landing } from './components/landing/landing';
import { Documents } from './teacher/documents/documents';
import { File } from './teacher/file/file';
import { Home } from './teacher/home/home';
import { Login as TeacherLogin } from './teacher/login/login';
import { Upload } from './teacher/upload/upload';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'admin', redirectTo: 'admin/dashboard', pathMatch: 'full' },
  { path: 'admin/login', component: AdminLogin },
  { path: 'admin/dashboard', component: Dashboard },
  { path: 'admin/files', component: Files },
  { path: 'admin/document', component: Document },
  { path: 'teacher', redirectTo: 'teacher/home', pathMatch: 'full' },
  { path: 'teacher/login', component: TeacherLogin },
  { path: 'teacher/home', component: Home },
  { path: 'teacher/documents', component: Documents },
  { path: 'teacher/file', component: File },
  { path: 'teacher/upload', component: Upload },
  { path: '**', redirectTo: '' },
];
