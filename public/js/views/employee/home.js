import { api } from '../../core/api.js';
import { busy, html, vibrate } from '../../core/dom.js';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatMonth,
} from '../../core/format.js';
import { startLiveClock, stopLiveClock } from '../../components/clock.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';

export async function employeeHome(ctx) {
  const data = await api.get('/employee/home');
  const { employee, record, month, loans, closure, meta, today } = data;
  const currency = meta.currency;
  const locked = Boolean(closure.until) && today <= closure.until;
  const isIn = Boolean(record?.checkIn) && !record?.checkOut;
  const isDone = Boolean(record?.checkOut);
  const canPunch = !locked && !isDone;
  const mode = isIn ? 'out' : 'in';

  const headline = locked
    ? 'فترة الرواتب مقفولة'
    : isDone
      ? 'أتممت يومك بنجاح'
      : isIn
        ? 'أنت على رأس العمل'
        : 'لم تسجل حضورك بعد';

  const subline = locked
    ? `لا يمكن تسجيل الحضور حتى ${closure.until}`
    : isDone
      ? `من ${record.checkIn} إلى ${record.checkOut}`
      : isIn
        ? `سجلت الحضور الساعة ${record.checkIn}`
        : 'اضغط الزر بالأسفل لتسجيل الحضور الآن.';

  const status = isDone
    ? html`<span class="pill pill--light">${icon('check', 14)} انصرف</span>`
    : isIn
      ? html`<span class="pill pill--light">${icon('clock', 14)} حاضر</span>`
      : locked
        ? html`<span class="pill pill--light">${icon('lock', 14)} مقفول</span>`
        : html`<span class="pill pill--light">لم يبدأ</span>`;

  const stat = (tone, label, value, iconName) => html`
    <div class="stat stat--${tone}">
      <span class="stat__icon">${icon(iconName, 17)}</span>
      <b class="stat__value">${value}</b>
      <span class="stat__label">${label}</span>
    </div>
  `;

  return {
    html: html`
      <div class="stack">
        <section class="punch-card ${isDone ? 'punch-card--done' : ''}">
          <div class="punch-top">
            <div>
              <p class="eyebrow">${formatDate(today, { year: undefined })}</p>
              <div class="clock-live" data-live-clock>--:--</div>
              <p class="punch-sub">${meta.companyName}</p>
            </div>
            ${status}
          </div>

          <div class="punch-mid">
            <span class="punch-state-icon">
              ${icon(isDone ? 'checkCircle' : isIn ? 'briefcase' : locked ? 'lock' : 'clock', 24)}
            </span>
            <div>
              <h2>${headline}</h2>
              <p>${subline}</p>
            </div>
          </div>

          ${canPunch
            ? html`
                <button class="punch-btn" type="button" data-action="punch">
                  <span class="punch-btn__icon">
                    ${icon(mode === 'in' ? 'checkCircle' : 'logOut', 23)}
                  </span>
                  <span class="punch-btn__text">
                    <b>${mode === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف'}</b>
                    <small>${mode === 'in' ? 'اضغط لتأكيد بداية اليوم' : 'اضغط لتأكيد نهاية اليوم'}</small>
                  </span>
                </button>
              `
            : isDone
              ? html`
                  <div class="punch-done">
                    ${icon('checkCircle', 22)}
                    <span>إجمالي وقت العمل ${formatDuration(record.workedMinutes)}</span>
                  </div>
                `
              : html`
                  <div class="punch-locked">
                    ${icon('lock', 18)}
                    <span>التسجيل مغلق لهذه الفترة. تواصل مع الإدارة.</span>
                  </div>
                `}

          <div class="punch-times">
            <div class="time-box">
              <span>الحضور</span>
              <b>${record?.checkIn || '—'}</b>
            </div>
            <div class="time-box">
              <span>الانصراف</span>
              <b>${record?.checkOut || '—'}</b>
            </div>
            ${record?.lateMinutes
              ? html`<div class="time-box time-box--warn">
                  <span>التأخير</span>
                  <b>${formatDuration(record.lateMinutes)}</b>
                </div>`
              : ''}
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">ملخص ${formatMonth(month.key)}</h2>
              <p class="muted">أيام الحضور والأجازات المسجلة.</p>
            </div>
            <span class="pill">${employee.type || '—'}</span>
          </div>
          <div class="stat-grid">
            ${stat('present', 'حضور', month.summary.present, 'checkCircle')}
            ${stat('warning', 'تأخير', month.summary.late, 'clock')}
            ${stat('absent', 'غياب', month.summary.absent, 'xCircle')}
            ${stat('leave', 'إجازة', month.summary.leave + month.summary.half, 'calendar')}
          </div>
        </section>

        <section class="card loan-snap">
          <div class="loan-snap__head">
            <span class="icon-chip icon-chip--blue">${icon('wallet', 21)}</span>
            <div>
              <p class="muted">السلف المفتوحة</p>
              <h2>${formatMoney(loans.openBalance, currency)}</h2>
            </div>
          </div>

          ${loans.pending
            ? html`<div class="notice notice--warning">
                ${icon('clock', 17)}
                <span>لديك طلب سلفة قيد مراجعة الإدارة</span>
              </div>`
            : html`<p class="muted">يمكنك تقديم طلب سلفة ومتابعة حالته من هنا.</p>`}

          <button class="btn btn--soft btn--block" type="button" data-action="open-loans">
            ${icon('plus', 18)} طلب سلفة جديدة
          </button>
        </section>

        <p class="page-foot">${icon('info', 14)} يتم تحديث بياناتك مباشرة من برنامج الرواتب.</p>
      </div>
    `,

    mount(root) {
      startLiveClock(root, meta.timezone);

      root.querySelector('[data-action="open-loans"]')?.addEventListener('click', () => {
        ctx.navigate('/loans');
      });

      const button = root.querySelector('[data-action="punch"]');
      button?.addEventListener('click', async () => {
        vibrate(12);
        busy(button, true);
        try {
          const result = await api.post(
            `/employee/attendance/${mode === 'in' ? 'check-in' : 'check-out'}`,
          );
          vibrate(25);
          toast(result.message);
          ctx.refresh();
        } catch (error) {
          toast(error.message, 'error');
          busy(button, false);
        }
      });
    },

    destroy() {
      stopLiveClock();
    },
  };
}
