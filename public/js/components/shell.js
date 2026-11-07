import { html } from '../core/dom.js';
import { formatDate, greeting } from '../core/format.js';
import { avatar } from '../ui/avatar.js';
import { icon } from '../ui/icons.js';

const EMPLOYEE_NAV = [
  { path: '/', label: 'الرئيسية', iconName: 'home' },
  { path: '/attendance', label: 'الحضور', iconName: 'calendar' },
  { path: '/loans', label: 'السلف', iconName: 'wallet' },
  { path: '/profile', label: 'حسابي', iconName: 'user' },
];

const ADMIN_NAV = [
  { path: '/admin', label: 'الرئيسية', iconName: 'home' },
  { path: '/admin/attendance', label: 'الحضور', iconName: 'calendar' },
  { path: '/admin/loans', label: 'الطلبات', iconName: 'banknote', badge: 'loans' },
  { path: '/admin/accounts', label: 'الموظفون', iconName: 'users' },
  { path: '/admin/settings', label: 'الإعدادات', iconName: 'sliders' },
];

export function shellView(session) {
  const admin = session.role === 'admin';
  const meta = session.meta;
  const nav = admin ? ADMIN_NAV : EMPLOYEE_NAV;
  const employee = session.employee || {};
  const name = admin ? 'لوحة الإدارة' : employee.name || session.account?.name || '';
  const subtitle = admin
    ? meta.companyName
    : [employee.job, employee.branch].filter(Boolean).join(' · ');
  const hour = Number(String(meta.now || '12:00').split(':')[0]);

  return html`
    <header class="app-header">
      <div class="who">
        ${avatar(admin ? { name: 'admin' } : employee, 52, { admin })}
        <div class="who__text">
          <p class="who__greeting">${greeting(hour)}،</p>
          <h1 class="who__name">${name}</h1>
          <p class="who__meta">${subtitle || meta.appName}</p>
        </div>
      </div>
      <button
        class="icon-btn"
        type="button"
        data-action="logout"
        aria-label="تسجيل الخروج"
        title="تسجيل الخروج"
      >
        ${icon('logOut', 20)}
      </button>
    </header>

    <main id="page" class="page"></main>

    <nav class="bottom-nav" aria-label="التنقل الرئيسي">
      <div class="nav-brand">
        <span class="nav-brand__mark">${icon('clock', 22)}</span>
        <div class="nav-brand__text">
          <b>${meta.companyName}</b>
          <span>${meta.appName}</span>
        </div>
      </div>
      ${nav.map(
        (item) => html`
          <a class="nav-item" href="#${item.path}" data-nav="${item.path}">
            ${icon(item.iconName, 21)}
            <span>${item.label}</span>
            ${item.badge
              ? html`<b class="nav-badge" data-badge="${item.badge}" hidden>0</b>`
              : ''}
          </a>
        `,
      )}
      <div class="nav-foot">${formatDate(meta.today, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}</div>
    </nav>
  `;
}

export function markActiveNav(path) {
  for (const item of document.querySelectorAll('[data-nav]')) {
    item.classList.toggle('is-active', item.dataset.nav === path);
  }
}

export function setPendingBadge(count) {
  const badge = document.querySelector('[data-badge="loans"]');
  if (!badge) return;
  const value = Number(count) || 0;
  badge.textContent = value > 9 ? '9+' : String(value);
  badge.hidden = value <= 0;
}
