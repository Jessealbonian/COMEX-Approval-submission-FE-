import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { IndexComponent } from './landing-page/index/index.component';
import { NotFoundComponent } from './landing-page/not-found/not-found.component';
import { LoginStaffComponent } from './landing-page/login/login-staff/login-staff.component';
import { LoginStudentComponent } from './landing-page/login/login-student/login-student.component';
import { RegisterComponent } from './landing-page/register/register.component';
import { StudDashboardComponent } from './stud-side/stud-dashboard/stud-dashboard.component';
import { StudMenuComponent } from './stud-side/stud-menu/stud-menu.component';
import { StudCartComponent } from './stud-side/stud-cart/stud-cart.component';
import { StudProfileComponent } from './stud-side/stud-profile/stud-profile.component';
import { StudOrdersComponent } from './stud-side/stud-orders/stud-orders.component';
import { VolunteerOrdersComponent } from './stud-side/volunteer-orders/volunteer-orders.component';
import { StaffDashboardComponent } from './staff-side/staff-dashboard/staff-dashboard.component';
import { OrdersComponent } from './staff-side/orders/orders.component';
import { MenuComponent } from './staff-side/menu/menu.component';
import { InventoryComponent } from './staff-side/inventory/inventory.component';
import { VolunteersComponent } from './staff-side/volunteers/volunteers.component';
import { UserManagementComponent } from './staff-side/user-management/user-management.component';
import { LogsComponent } from './staff-side/logs/logs.component';
import { AboutComponent } from './landing-page/about/about.component';
export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: IndexComponent },
  { path: 'about', component: AboutComponent },
  {
    path: 'login',
    children: [
      {
        path: 'staff',
        component: LoginStaffComponent,
      },
      {
        path: 'student',
        component: LoginStudentComponent,
      },
    ],
  },
  { path: 'staff', redirectTo: 'staff/staff-dashboard', pathMatch: 'full' },
  {
    path: 'staff',
    children: [
      {
        path: 'staff-dashboard',
        component: StaffDashboardComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
      {
        path: 'orders',
        component: OrdersComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
      {
        path: 'menu',
        component: MenuComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
      {
        path: 'inventory',
        component: InventoryComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
      {
        path: 'volunteers',
        component: VolunteersComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
      {
        path: 'user-management',
        component: UserManagementComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
      {
        path: 'logs',
        component: LogsComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('staff');
            const user = auth.getCurrentUser('staff');
            return !!token && user?.role === 'staff';
          },
        ],
      },
    ],
  },
  { path: 'student', redirectTo: 'student/stud-dashboard', pathMatch: 'full' },
  {
    path: 'student',
    children: [
      {
        path: 'stud-dashboard',
        component: StudDashboardComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('student');
            const user = auth.getCurrentUser('student');
            return (
              !!token &&
              (user?.role === 'student' || user?.role === 'volunteer')
            );
          },
        ],
      },
      {
        path: 'menu',
        component: StudMenuComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('student');
            const user = auth.getCurrentUser('student');
            return (
              !!token &&
              (user?.role === 'student' || user?.role === 'volunteer')
            );
          },
        ],
      },
      {
        path: 'cart',
        component: StudCartComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('student');
            const user = auth.getCurrentUser('student');
            return (
              !!token &&
              (user?.role === 'student' || user?.role === 'volunteer')
            );
          },
        ],
      },
      {
        path: 'profile',
        component: StudProfileComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('student');
            const user = auth.getCurrentUser('student');
            return (
              !!token &&
              (user?.role === 'student' || user?.role === 'volunteer')
            );
          },
        ],
      },
      {
        path: 'orders',
        component: StudOrdersComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('student');
            const user = auth.getCurrentUser('student');
            return (
              !!token &&
              (user?.role === 'student' || user?.role === 'volunteer')
            );
          },
        ],
      },
      {
        path: 'volunteer-orders',
        component: VolunteerOrdersComponent,
        canActivate: [
          () => {
            const auth = inject(AuthService);
            const token = auth.getToken('student');
            const user = auth.getCurrentUser('student');
            return !!token && user?.role === 'volunteer';
          },
        ],
      },
    ],
  },
  { path: 'register', component: RegisterComponent },
  { path: '**', component: NotFoundComponent },
];
