import { api, connectEvents } from './core/api.js';
import { closeAllSheets } from './ui/sheet.js';
import { sessionApi } from './core/session.js';
import { setHtml } from './core/dom.js';
import { toast } from './ui/toast.js';
import { shellView, markActiveNav, setPendingBadge } from './components/shell.js';
import { errorView, pageSkeleton } from './components/states.js';
import { loginView } from './views/auth/login.js';
import { setupView } from './views/auth/setup.js';
import { employeeHome } from './views/employee/home.js';
import { employeeAttendance } from './views/employee/attendance.js';
import { employeeLoans } from './views/employee/loans.js';
import { employeeProfile } from './views/employee/profile.js';
import { adminHome } from './views/admin/home.js';
import { adminAttendance } from './views/admin/attendance.js';
import { adminLoans } from './views/admin/loans.js';
import { adminAccounts } from './views/admin/accounts.js';
import { adminSettings } from './views/admin/settings.js';

const app = document.getElementById('app');

const EMPLOYEE_ROUTES = {
  '/': employeeHome,
  '/attendance': employeeAttendance,
  '/loans': employeeLoans,
  '/profile': employeeProfile,
};

const ADMIN_ROUTES = {
  '/admin': adminHome,
  '/admin/attendance': adminAttendance,
  '/admin/loans': adminLoans,
  '/admin/accounts': adminAccounts,
  '/admin/settings': adminSettings,
};

const AUTO_REFRESH = {
  employee: new Set(['/', '/attendance']),
  admin: new Set(['/admin', '/admin/attendance', '/admin/loans']),
};

const LIVE_COLLECTIONS = new Set([
  'attendance',
  'advances',
  'loanRequests',
  'employees',
  'closes',
  'accounts',
  'users',
]);

const state = {
  session: null,
  path: '/',
  liveCleanup: null,
  factory: null,
};

let page = null;
let currentView = null;
let renderToken = 0;
let liveTimer = null;
let hashBound = false;

const ctx = {
  get session() {
    return state.session;
  },
  get meta() {
    return state.session?.meta || {};
  },
  navigate(path) {
    if (location.hash === `#${path}`) return;
    location.hash = `#${path}`;
  },
  refresh() {
    if (state.factory) renderPage(state.factory, { silent: true });
  },
  async refreshBadge() {
    try {
      const session = await sessionApi.load();
      state.session = session;
      setPendingBadge(session.badge?.pendingLoans || 0);
    } catch {
      // non-critical
    }
  },
  async reloadSession() {
    try {
      const session = await sessionApi.load();
      state.session = session;
      if (!session.authenticated) {
        showAuth();
        return;
      }
      mountShell();
      route();
    } catch {
      // non-critical
    }
  },
  toast,
};

async function boot() {
  try {
    const session = await sessionApi.load();
    state.session = session;
    if (!session.authenticated) {
      showAuth();
      return;
    }
    if (followNextRedirect(session)) return;
    mountShell();
    route();
  } catch (error) {
    app.className = 'app app--auth';
    setHtml(app, errorView(error.message));
    app.querySelector('[data-action="retry"]')?.addEventListener('click', boot);
  }
}

function followNextRedirect(session) {
  if (session.role !== 'admin') return false;
  const next = new URLSearchParams(location.search).get('next');
  if (next && next.startsWith('/payroll')) {
    location.replace(next);
    return true;
  }
  return false;
}

function showAuth() {
  disconnectLive();
  currentView?.destroy?.();
  currentView = null;
  closeAllSheets();
  app.className = 'app app--auth';

  const session = state.session;
  const view = session.needsSetup
    ? setupView({ meta: session.meta, onAuth: handleAuth })
    : loginView({ meta: session.meta, onAuth: handleAuth });

  setHtml(app, view.html);
  view.mount?.(app, ctx);
}

function handleAuth(session) {
  state.session = session;
  if (followNextRedirect(session)) return;

  const home = session.role === 'admin' ? '/admin' : '/';
  history.replaceState(null, '', `#${home}`);
  mountShell();
  route();
}

function mountShell() {
  disconnectLive();
  currentView?.destroy?.();
  currentView = null;
  closeAllSheets();

  app.className = 'app';
  setHtml(app, shellView(state.session));
  page = document.getElementById('page');

  app.querySelector('[data-action="logout"]')?.addEventListener('click', logout);

  if (!hashBound) {
    window.addEventListener('hashchange', () => route());
    hashBound = true;
  }

  connectLive();
  setPendingBadge(state.session.badge?.pendingLoans || 0);
}

async function logout() {
  try {
    await sessionApi.logout();
  } catch {
    // even if the request fails, leave the UI
  }
  location.replace('/');
}

function route() {
  if (!state.session?.authenticated) return;

  const admin = state.session.role === 'admin';
  const routes = admin ? ADMIN_ROUTES : EMPLOYEE_ROUTES;
  let path = location.hash.replace(/^#/, '') || (admin ? '/admin' : '/');

  if (!routes[path]) path = admin ? '/admin' : '/';

  if (location.hash !== `#${path}`) {
    history.replaceState(null, '', `#${path}`);
  }

  state.path = path;
  markActiveNav(path);
  closeAllSheets();

  state.factory = routes[path];
  renderPage(state.factory, { silent: false });
}

async function renderPage(factory, { silent = false } = {}) {
  if (!page) return;
  const token = (renderToken += 1);
  const target = freshPage();

  if (!silent) setHtml(target, pageSkeleton());
  else target.classList.add('is-refreshing');

  try {
    const view = await factory(ctx);
    if (token !== renderToken) return;

    currentView?.destroy?.();
    currentView = view;
    setHtml(target, view.html);
    view.mount?.(target, ctx);
    if (!silent) window.scrollTo(0, 0);
    else target.classList.remove('is-refreshing');
  } catch (error) {
    if (token !== renderToken) return;
    if (error.status === 401) {
      location.replace('/');
      return;
    }
    currentView?.destroy?.();
    currentView = null;
    setHtml(
      target,
      errorView(error.message || 'تعذّر تحميل الصفحة'),
    );
    target.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
      renderPage(factory, { silent: false });
    });
    target.classList.remove('is-refreshing');
  }
}

/**
 * Each render gets a brand new <main> element. Views attach delegated
 * listeners to it, so replacing the element guarantees those listeners never
 * accumulate across refreshes and live updates.
 */
function freshPage() {
  const next = document.createElement('main');
  next.id = 'page';
  next.className = 'page';
  page.replaceWith(next);
  page = next;
  return next;
}

function connectLive() {
  disconnectLive();
  const role = state.session?.role;
  state.liveCleanup = connectEvents((collection) => {
    if (!LIVE_COLLECTIONS.has(collection)) return;
    if (!AUTO_REFRESH[role]?.has(state.path)) return;
    if (document.querySelector('.sheet-backdrop')) return;
    const active = document.activeElement;
    if (active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return;

    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => ctx.refresh(), 800);
  });
}

function disconnectLive() {
  clearTimeout(liveTimer);
  state.liveCleanup?.();
  state.liveCleanup = null;
}

window.addEventListener('app:unauthorized', () => location.replace('/'));

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

boot();
