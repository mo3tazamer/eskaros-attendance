import { api } from '../../core/api.js';
import { html, on } from '../../core/dom.js';
import {
  STATUS_LABELS,
  STATUS_TONES,
  formatDate,
  formatDuration,
  formatLate,
  formatMonth,
} from '../../core/format.js';
import { emptyState } from '../../components/states.js';
import { statusPill } from '../../components/status.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';

let selectedMonth = null;

const WEEKDAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

export async function employeeAttendance(ctx) {
  const today = ctx.session.meta.today;
  if (!selectedMonth) selectedMonth = today.slice(0, 7);

  const data = await api.get(`/employee/attendance?month=${selectedMonth}`);
  const records = new Map(data.records.map((record) => [record.date, record]));
  const monthKey = data.month;
  const canGoNext = monthKey < today.slice(0, 7);

  const cells = buildCalendar(monthKey, records, today);

  return {
    html: html`
      <div class="stack">
        <section class="card">
          <div class="month-nav">
            <button class="icon-btn" type="button" data-action="prev-month" aria-label="الشهر السابق">
              ${icon('chevronRight', 20)}
            </button>
            <div class="month-nav__label">
              <b>${formatMonth(monthKey)}</b>
              <span class="muted">${data.records.length} يوم مسجل</span>
            </div>
            <button
              class="icon-btn"
              type="button"
              data-action="next-month"
              aria-label="الشهر التالي"
              ${canGoNext ? '' : 'disabled'}
            >
              ${icon('chevronLeft', 20)}
            </button>
          </div>

          <div class="stat-grid stat-grid--tight">
            <div class="mini-stat"><b>${data.summary.present}</b><span>حضور</span></div>
            <div class="mini-stat"><b>${data.summary.late}</b><span>تأخير</span></div>
            <div class="mini-stat"><b>${data.summary.absent}</b><span>غياب</span></div>
            <div class="mini-stat"><b>${data.summary.leave + data.summary.half}</b><span>إجازة / نصف</span></div>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">تقويم الشهر</h2>
              <p class="muted">اضغط على أي يوم لعرض التفاصيل.</p>
            </div>
          </div>

          <div class="calendar">
            ${WEEKDAYS.map((day) => html`<span class="calendar__dow">${day}</span>`)}
            ${cells}
          </div>

          <div class="legend">
            <span><i class="legend__dot legend__dot--present"></i> حضور</span>
            <span><i class="legend__dot legend__dot--absent"></i> غياب</span>
            <span><i class="legend__dot legend__dot--leave"></i> إجازة</span>
            <span><i class="legend__dot legend__dot--half"></i> نصف يوم</span>
          </div>
        </section>

        ${data.records.length
          ? html`
              <section class="card">
                <div class="section-head">
                  <h2 class="section-title">آخر التسجيلات</h2>
                </div>
                <div class="list">
                  ${[...data.records]
                    .reverse()
                    .slice(0, 6)
                    .map(
                      (record) => html`
                        <button class="list-row list-row--tap" type="button" data-date="${record.date}">
                          <span class="date-badge">
                            <b>${record.date.slice(8)}</b>
                            <small>${formatDate(record.date, { weekday: 'short', year: undefined, month: 'short' })}</small>
                          </span>
                          <span class="list-row__main">
                            <b>${STATUS_LABELS[record.st] || record.st}</b>
                            <span>${record.checkIn ? `${record.checkIn} — ${record.checkOut || '...'}` : 'بدون وقت تسجيل'}</span>
                          </span>
                          ${record.lateMinutes
                            ? html`<span class="pill pill--warning">${formatDuration(record.lateMinutes)}</span>`
                            : statusPill(record.st)}
                        </button>
                      `,
                    )}
                </div>
              </section>
            `
          : emptyState({
              iconName: 'calendar',
              title: 'لا توجد تسجيلات',
              text: 'لم يتم تسجيل حضور في هذا الشهر بعد.',
            })}

        <p class="page-foot">${icon('info', 14)} تُحدَّث أيام الحضور تلقائيًا في برنامج الرواتب.</p>
      </div>
    `,

    mount(root) {
      const shiftMonth = (delta) => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const date = new Date(year, month - 1 + delta, 1, 12);
        const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (next > today.slice(0, 7)) return;
        selectedMonth = next;
        ctx.refresh();
      };

      root.querySelector('[data-action="prev-month"]')?.addEventListener('click', () => shiftMonth(-1));
      root.querySelector('[data-action="next-month"]')?.addEventListener('click', () => {
        if (canGoNext) shiftMonth(1);
      });

      on(root, 'click', '[data-date]', (event, node) => {
        const date = node.dataset.date;
        const record = records.get(date);
        openSheet({
          title: formatDate(date, { year: undefined }),
          subtitle: record ? STATUS_LABELS[record.st] || record.st : 'لا يوجد تسجيل',
          hideSubmit: true,
          cancelLabel: 'إغلاق',
          body: record
            ? html`
                <div class="detail-grid">
                  <div class="detail-item">
                    <span>الحالة</span>
                    ${statusPill(record.st)}
                  </div>
                  <div class="detail-item">
                    <span>الحضور</span>
                    <b>${record.checkIn || '—'}</b>
                  </div>
                  <div class="detail-item">
                    <span>الانصراف</span>
                    <b>${record.checkOut || '—'}</b>
                  </div>
                  <div class="detail-item">
                    <span>وقت العمل</span>
                    <b>${record.checkOut ? formatDuration(record.workedMinutes) : '—'}</b>
                  </div>
                </div>
                ${record.lateMinutes
                  ? html`<div class="notice notice--warning">
                      ${icon('clock', 17)} ${formatLate(record.lateMinutes)}
                    </div>`
                  : ''}
              `
            : html`<div class="notice notice--muted">
                ${icon('info', 17)} لا يوجد تسجيل حضور في هذا اليوم.
              </div>`,
        });
      });
    },
  };
}

function buildCalendar(monthKey, records, today) {
  const first = new Date(`${monthKey}-01T12:00:00`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 1) % 7;
  const cells = [];

  for (let index = 0; index < offset; index += 1) {
    cells.push(html`<span class="day day--empty"></span>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    const record = records.get(date);
    const classes = ['day'];
    if (record) classes.push(`day--${STATUS_TONES[record.st] || 'present'}`);
    if (date === today) classes.push('day--today');
    if (date > today) classes.push('day--future');

    cells.push(html`
      <button type="button" class="${classes.join(' ')}" data-date="${date}">
        <span>${day}</span>
        ${record ? html`<i class="day__dot"></i>` : ''}
      </button>
    `);
  }

  return cells;
}
