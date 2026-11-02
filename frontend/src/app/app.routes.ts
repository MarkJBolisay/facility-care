import type { Routes } from '@angular/router';
import { authGuard, guestGuard, homeRedirect, roleGuard } from './core/guards';

const page = {
  login: () => import('./pages/auth/login.page').then((m) => m.LoginPage),
  register: () => import('./pages/auth/register.page').then((m) => m.RegisterPage),
  tabs: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
  adminDashboard: () => import('./pages/admin/admin-dashboard.page').then((m) => m.AdminDashboardPage),
  maintenanceDashboard: () =>
    import('./pages/maintenance/maintenance-dashboard.page').then((m) => m.MaintenanceDashboardPage),
  reporterHome: () => import('./pages/reporter/reporter-home.page').then((m) => m.ReporterHomePage),
  reports: () => import('./pages/reports/reports.page').then((m) => m.ReportsPage),
  reportForm: () => import('./pages/reports/report-form.page').then((m) => m.ReportFormPage),
  reportDetail: () => import('./pages/reports/report-detail.page').then((m) => m.ReportDetailPage),
  workOrders: () => import('./pages/work-orders/work-orders.page').then((m) => m.WorkOrdersPage),
  workOrderForm: () => import('./pages/work-orders/work-order-form.page').then((m) => m.WorkOrderFormPage),
  workOrderDetail: () => import('./pages/work-orders/work-order-detail.page').then((m) => m.WorkOrderDetailPage),
  facilities: () => import('./pages/facilities/facilities.page').then((m) => m.FacilitiesPage),
  facilityForm: () => import('./pages/facilities/facility-form.page').then((m) => m.FacilityFormPage),
  facilityDetail: () => import('./pages/facilities/facility-detail.page').then((m) => m.FacilityDetailPage),
  users: () => import('./pages/users/users.page').then((m) => m.UsersPage),
  userForm: () => import('./pages/users/user-form.page').then((m) => m.UserFormPage),
  analytics: () => import('./pages/admin/analytics.page').then((m) => m.AnalyticsPage),
  more: () => import('./pages/admin/more.page').then((m) => m.MorePage),
  notifications: () => import('./pages/notifications/notifications.page').then((m) => m.NotificationsPage),
  sendNotification: () =>
    import('./pages/notifications/send-notification.page').then((m) => m.SendNotificationPage),
  profile: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  equipment: () => import('./pages/equipment/equipment-list.page').then((m) => m.EquipmentListPage),
  equipmentDetail: () => import('./pages/equipment/equipment-detail.page').then((m) => m.EquipmentDetailPage),
  equipmentForm: () => import('./pages/equipment/equipment-form.page').then((m) => m.EquipmentFormPage),
  preventive: () => import('./pages/equipment/preventive.page').then((m) => m.PreventivePage),
  technicians: () => import('./pages/technicians/technicians.page').then((m) => m.TechniciansPage),
  technicianDetail: () => import('./pages/technicians/technician-detail.page').then((m) => m.TechnicianDetailPage),
  activity: () => import('./pages/admin/activity.page').then((m) => m.ActivityPage),
};

const admin = roleGuard('admin');
const maintenance = roleGuard('maintenance');
const reporter = roleGuard('student', 'faculty', 'staff');
const staffSide = roleGuard('admin', 'maintenance');

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: page.login },
  { path: 'register', canActivate: [guestGuard], loadComponent: page.register },

  {
    path: 'tabs',
    canActivate: [authGuard],
    loadComponent: page.tabs,
    children: [
      // Administrator
      { path: 'dashboard', canActivate: [admin], loadComponent: page.adminDashboard },
      { path: 'reports', canActivate: [admin], loadComponent: page.reports },
      { path: 'work-orders', canActivate: [admin], loadComponent: page.workOrders, data: { scope: 'all' } },
      { path: 'equipment', canActivate: [admin], loadComponent: page.equipment },
      { path: 'facilities', canActivate: [admin], loadComponent: page.facilities },
      { path: 'more', canActivate: [admin], loadComponent: page.more },

      // Maintenance personnel
      { path: 'home', canActivate: [maintenance], loadComponent: page.maintenanceDashboard },
      { path: 'tasks', canActivate: [maintenance], loadComponent: page.workOrders, data: { scope: 'active' } },
      { path: 'history', canActivate: [maintenance], loadComponent: page.workOrders, data: { scope: 'history' } },

      // Students / faculty / staff
      { path: 'my-home', canActivate: [reporter], loadComponent: page.reporterHome },
      { path: 'my-reports', canActivate: [reporter], loadComponent: page.reports },
      { path: 'new-report', canActivate: [reporter], loadComponent: page.reportForm },

      // Shared tabs
      { path: 'alerts', loadComponent: page.notifications },
      { path: 'profile', loadComponent: page.profile },

      { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
    ],
  },

  // Detail & form screens (pushed on top of the tabs)
  { path: 'reports/new', canActivate: [authGuard], loadComponent: page.reportForm },
  { path: 'reports/:id', canActivate: [authGuard], loadComponent: page.reportDetail },
  { path: 'work-orders/new', canActivate: [authGuard, admin], loadComponent: page.workOrderForm },
  { path: 'work-orders/:id/edit', canActivate: [authGuard, admin], loadComponent: page.workOrderForm },
  { path: 'work-orders/:id', canActivate: [authGuard], loadComponent: page.workOrderDetail },
  { path: 'facilities/new', canActivate: [authGuard, admin], loadComponent: page.facilityForm },
  { path: 'facilities/:id/edit', canActivate: [authGuard, admin], loadComponent: page.facilityForm },
  { path: 'facilities/:id', canActivate: [authGuard, staffSide], loadComponent: page.facilityDetail },
  { path: 'equipment/new', canActivate: [authGuard, admin], loadComponent: page.equipmentForm },
  { path: 'equipment/:id/edit', canActivate: [authGuard, admin], loadComponent: page.equipmentForm },
  { path: 'equipment/:id', canActivate: [authGuard, staffSide], loadComponent: page.equipmentDetail },
  { path: 'equipment-list', canActivate: [authGuard, staffSide], loadComponent: page.equipment },
  { path: 'preventive-maintenance', canActivate: [authGuard, admin], loadComponent: page.preventive },
  { path: 'technicians', canActivate: [authGuard, admin], loadComponent: page.technicians },
  { path: 'technicians/:id', canActivate: [authGuard, admin], loadComponent: page.technicianDetail },
  { path: 'activity', canActivate: [authGuard, admin], loadComponent: page.activity },
  { path: 'facilities-list', canActivate: [authGuard, admin], loadComponent: page.facilities },
  { path: 'users', canActivate: [authGuard, admin], loadComponent: page.users },
  { path: 'users/new', canActivate: [authGuard, admin], loadComponent: page.userForm },
  { path: 'users/:id', canActivate: [authGuard, admin], loadComponent: page.userForm },
  { path: 'analytics', canActivate: [authGuard, admin], loadComponent: page.analytics },
  { path: 'notifications', canActivate: [authGuard], loadComponent: page.notifications },
  { path: 'notifications/send', canActivate: [authGuard, admin], loadComponent: page.sendNotification },
  { path: 'profile', canActivate: [authGuard], loadComponent: page.profile },

  { path: '', pathMatch: 'full', canActivate: [authGuard, homeRedirect], children: [] },
  { path: '**', redirectTo: '' },
];
