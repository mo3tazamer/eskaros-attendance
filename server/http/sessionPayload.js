import { publicAccount, publicEmployee } from '../services/auth.js';

/**
 * Everything the shell needs to render, for both authenticated and anonymous
 * visitors. Keeping this in one place guarantees the login screen and the app
 * agree on branding and time.
 */
export function buildSessionPayload({ auth, store, settings, clock }, current) {
  const values = settings.get();
  const company = settings.company();
  const meta = {
    appName: values.appName,
    companyName: company.name,
    hasLogo: company.hasLogo,
    currency: values.currency,
    timezone: values.timezone,
    workStart: values.workStart,
    workEnd: values.workEnd,
    lateGraceMinutes: values.lateGraceMinutes,
    today: clock.today(),
    now: clock.time(),
  };

  if (!current) {
    return {
      authenticated: false,
      needsSetup: !auth.hasAdmin(),
      meta,
    };
  }

  const pendingLoans = store
    .list('loanRequests')
    .filter((request) => request.status === 'pending').length;

  return {
    authenticated: true,
    needsSetup: false,
    role: current.account.role,
    account: publicAccount(current.account),
    employee: publicEmployee(current.employee),
    badge: {
      pendingLoans: current.account.role === 'admin' ? pendingLoans : 0,
    },
    meta,
  };
}
