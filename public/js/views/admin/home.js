import { api } from '../../core/api.js';
import { html } from '../../core/dom.js';
import { formatDate, formatMoney, formatNumber } from '../../core/format.js';
import { startLiveClock, stopLiveClock } from '../../components/clock.js';
import { avatar } from '../../ui/avatar.js';
import { icon } from '../../ui/icons.js';
import { confirmSheet } from '../../ui/sheet.js';

export async function adminHome(ctx) {
  const data = await api.get('/admin/overview');
  const { stats, settings } = data;
  const currency = settings.currency || 'ج.م';
  const percent = stats.activeEmployees
    ? Math.round((stats.recorded / stats.activeEmployees) * 100)
    : 0;

  return {
    html: html`
      <div class="stack">
        <section class="admin-hero">
          <div class="admin-hero__top">
            <div>
              <p class="eyebrow">${formatDate(data.today, { year: undefined })}</p>
              <h2>${data.company.name}</h2>
              <p class="muted">${data.now} · ${settings.timezone}</p>
            </div>
            <span class="badge-soft">لوحة الإدارة</span>
          </div>

          <div class="admin-hero__clock" data-live-clock>--:--</div>

          <div class="hero-actions">
            <a class="btn btn--light" href="/payroll/">
              ${icon('briefcase', 18)} برنامج الرواتب
            </a>
            <button class="btn btn--light" type="button" data-action="bulk">
              ${icon('checkCircle', 18)} حضور الجميع
            </button>
          </div>
        </section>

        ${!data.payrollReady
          ? html`
              <section class="card notice-card">
                <div class="notice notice--warning">
                  ${icon('alert', 18)}
                  <span>لم يتم العثور على موظفين بعد. افتح برنامج الرواتب واستورد نسخة البيانات أولًا.</span>
                </div>
                <a class="btn btn--soft btn--block" href="/payroll/">
                  ${icon('briefcase', 18)} فتح برنامج الرواتب
                </a>
              </section>
            `
          : ''}

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">حضور اليوم</h2>
              <p class="muted">${stats.recorded} من ${stats.activeEmployees} موظفًا تم تسجيلهم.</p>
            </div>
            <span class="pill">${percent}%</span>
          </div>

          <div class="progress">
            <span class="progress__bar" style="width:${percent}%"></span>
          </div>

          <div class="stat-grid">
            ${stat('present', 'حاضر', stats.present, 'checkCircle')}
            ${stat('warning', 'متأخر', stats.late, 'clock')}
            ${stat('absent', 'غائب', stats.absent, 'xCircle')}
            ${stat('leave', 'إجازة', stats.leave + stats.half, 'calendar')}
          </div>

          ${stats.notRecorded
            ? html`<div class="notice notice--muted">
                ${icon('info', 17)}
                <span>${stats.notRecorded} موظفًا لم يسجّلوا حضورهم بعد.</span>
              </div>`
            : ''}
        </section>

        <section class="stat-grid stat-grid--wide">
          ${wideStat('users', 'الموظفون النشطون', formatNumber(stats.activeEmployees), 'briefcase')}
          ${wideStat('blue', 'حسابات البوابة', formatNumber(stats.withAccounts), 'key')}
          ${wideStat('warning', 'طلبات السلف', formatNumber(stats.pendingLoans), 'banknote')}
          ${wideStat('present', 'السلف المفتوحة', formatMoney(stats.openLoans, currency), 'wallet')}
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">طلبات السلف</h2>
              <p class="muted">${stats.pendingLoans ? 'طلبات تنتظر قرارك.' : 'لا توجد طلبات جديدة.'}</p>
            </div>
            <a class="section-link" href="#/admin/loans">عرض الكل</a>
          </div>

          ${data.pending.length
            ? html`<div class="list">
                ${data.pending.map(
                  (request) => html`
                    <a class="pending-row" href="#/admin/loans">
                      ${avatar({ name: request.empName }, 42)}
                      <span class="pending-row__main">
                        <b>${request.empName}</b>
                        <span>${formatMoney(request.amount, currency)} · ${
                          request.kind === 'scheduled' ? 'أقساط' : 'فوري'
                        }</span>
                      </span>
                      <span class="pill pill--warning">${icon('clock', 14)} مراجعة</span>
                    </a>
                  `,
                )}
              </div>`
            : html`<div class="empty-inline">${icon('checkCircle', 18)} لا توجد طلبات معلّقة.</div>`}
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">اختصارات</h2>
              <p class="muted">إدارة سريعة لكل ما تحتاجه.</p>
            </div>
          </div>

          <div class="quick-grid">
            ${quickTile('#/admin/attendance', 'calendar', 'تسجيل الحضور', 'عرض وتعديل حضور اليوم')}
            ${quickTile('#/admin/loans', 'banknote', 'طلبات السلف', 'اعتماد أو رفض الطلبات')}
            ${quickTile('#/admin/accounts', 'users', 'حسابات الموظفين', 'إنشاء وإدارة الحسابات')}
            ${quickTile('#/admin/settings', 'sliders', 'الإعدادات', 'مواعيد العمل والبيانات')}
          </div>
        </section>

        <p class="page-foot">
          ${icon('info', 14)} أي تعديل هنا يظهر مباشرة في برنامج الرواتب.
        </p>
      </div>
    `,

    mount(root) {
      startLiveClock(root, settings.timezone);

      root.querySelector('[data-action="bulk"]')?.addEventListener('click', async () => {
        const confirmed = await confirmSheet({
          title: 'تسجيل حضور الجميع',
          message: 'سيتم تسجيل جميع الموظفين النشطين حاضرين اليوم، مع تخطي من لديه تسجيل بالفعل.',
          confirmLabel: 'تأكيد التسجيل',
          iconName: 'checkCircle',
          iconTone: 'success',
        });
        if (!confirmed) return;

        try {
          const result = await api.post('/admin/attendance/bulk', {
            date: data.today,
            branch: '',
          });
          ctx.toast(result.message);
          ctx.refresh();
        } catch (error) {
          ctx.toast(error.message, 'error');
        }
      });
    },

    destroy() {
      stopLiveClock();
    },
  };
}

function stat(tone, label, value, iconName) {
  return html`
    <div class="stat stat--${tone}">
      <span class="stat__icon">${icon(iconName, 17)}</span>
      <b class="stat__value">${formatNumber(value)}</b>
      <span class="stat__label">${label}</span>
    </div>
  `;
}

function wideStat(tone, label, value, iconName) {
  return html`
    <div class="wide-stat wide-stat--${tone}">
      <span class="wide-stat__icon">${icon(iconName, 20)}</span>
      <div>
        <b>${value}</b>
        <span>${label}</span>
      </div>
    </div>
  `;
}

function quickTile(href, iconName, title, text) {
  return html`
    <a class="quick-tile" href="${href}">
      <span class="quick-tile__icon">${icon(iconName, 20)}</span>
      <b>${title}</b>
      <span class="muted">${text}</span>
    </a>
  `;
}
