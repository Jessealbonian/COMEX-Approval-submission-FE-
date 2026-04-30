import { Routes } from '@angular/router';

import { Dashboard } from './admin/dashboard/dashboard';
import { Document } from './admin/document/document';
import { Files } from './admin/files/files';
import { Account } from './admin/account/account';
import { Login as SharedLogin } from './components/login/login';
import { Landing } from './components/landing/landing';
import { Dashboard as CoardDashboard } from './coard/dashboard/dashboard';
import { Document as CoardDocument } from './coard/document/document';
import { Files as CoardFile } from './coard/file/file';
import { Dashboard as MasterDashboard } from './Master/dashboard/dashboard';
import { Document as MasterDocument } from './Master/document/document';
import { Files as MasterFile } from './Master/file/file';
import { Documents } from './teacher/documents/documents';
import { File } from './teacher/file/file';
import { Home } from './teacher/home/home';
import { Upload } from './teacher/upload/upload';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'login', component: SharedLogin },
  { path: 'admin', redirectTo: 'admin/dashboard', pathMatch: 'full' },
  { path: 'admin/login', component: SharedLogin },
  { path: 'admin/dashboard', component: Dashboard },
  { path: 'admin/files', component: Files },
  { path: 'admin/file', redirectTo: 'admin/files', pathMatch: 'full' },
  { path: 'admin/document', component: Document },
  { path: 'admin/account', component: Account },
  { path: 'coard', redirectTo: 'coard/dashboard', pathMatch: 'full' },
  { path: 'coard/login', component: SharedLogin },
  { path: 'coard/dashboard', component: CoardDashboard },
  { path: 'coard/document', component: CoardDocument },
  { path: 'coard/file', component: CoardFile },
  { path: 'master', redirectTo: 'master/dashboard', pathMatch: 'full' },
  { path: 'master/login', component: SharedLogin },
  { path: 'master/dashboard', component: MasterDashboard },
  { path: 'master/document', component: MasterDocument },
  { path: 'master/file', component: MasterFile },
  { path: 'teacher', redirectTo: 'teacher/home', pathMatch: 'full' },
  { path: 'teacher/login', component: SharedLogin },
  { path: 'teacher/home', component: Home },
  { path: 'teacher/documents', component: Documents },
  { path: 'teacher/file', component: File },
  { path: 'teacher/upload', component: Upload },
  { path: '**', redirectTo: '' },
];
