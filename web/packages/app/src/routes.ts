// Every path in one place, so a route move is one edit. The auth pages live
// under /auth (KAN-13 review); the guarded Account page stays at /account.
export const routes = {
  home: '/',
  signIn: '/auth/sign-in',
  signUp: '/auth/sign-up',
  forgotPassword: '/auth/forgot-password',
  restorePassword: '/auth/restore-password',
  account: '/account',
} as const;
