import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).parseUrl('/login');
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

/** Sends the user to their role's home screen. */
export const homeRedirect: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).parseUrl(auth.homeUrl());
};

export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const role = auth.role();
    if (role && roles.includes(role)) return true;
    return inject(Router).parseUrl(auth.homeUrl());
  };
}
