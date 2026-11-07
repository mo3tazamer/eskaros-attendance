import { api } from '../../core/api.js';
import { html, on, shiftDate } from '../../core/dom.js';
import { formatDate, formatNumber } from '../../core/format.js';
import { emptyState } from '../../components/states.js';
import { statusPill } from '../../components/status.js';
import { avatar } from '../../ui/avatar.js';
import { icon } from '../../ui/icons.js';
import { confirmSheet, openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';

const state = {
  date: null,
  branch: '',
  query: '',
};

const STATUS_OPTIONS = [
  { value: 'حضور', label: 'حضور' },
  { value: 'غياب', label: 'غياب' },
  { value: 'إجازة', label: 'إجازة' },
  { value: 'نص', label: 'نصف يوم' },
  { value: 'none', label: 'مسح التسجيل' },
];

export async function adminAttendance(ctx) {
  const today = ctx.session.meta.today;
  if (!state.date) state.date = today;
  if (state.date > today) state.date = today;

  const query = state.branch ? `?date=${state.date}&branch=${encodeURIComponent(state.branch)}` : `?date=${state.date}`;
  const data = await api.get(`/admin/attendance${query}`);
  const employees = filterEmployees(data.employees, state.query);
  const canGoNext = state.date < today;

  return {
    html: html`
      <div class="stack">
        <section class="card">
          <div class="month-nav">
            <button class="icon-btn" type="button" data-action="prev-day" aria-label="اليوم السابق">
              ${icon('chevronRight', 20)}
            </button>
            <div class="month-nav__label">
              <b>${formatDate(state.date, { year: undefined })}</b>
              <span class="muted">${formatNumber(data.summary.recorded)} من ${formatNumber(data.summary.active)} مسجل</span>
            </div>
            <button
              class="icon-btn"
              type="button"
              data-action="next-day"
              aria-label="اليوم التالي"
              ${canGoNext ? '' : 'disabled'}
            >
              ${icon('chevronLeft', 20)}
            </button>
          </div>

          <div class="summary-chips">
            <span class="summary-chip summary-chip--present"><b>${data.summary.present}</b> حاضر</span>
            <span class="summary-chip summary-chip--warning"><b>${data.summary.late}</b> متأخر</span>
            <span class="summary-chip summary-chip--absent"><b>${data.summary.absent}</b> غائب</span>
            <span class="summary-chip summary-chip--leave"><b>${data.summary.leave + data.summary.half}</b> إجازة</span>
            <span class="summary-chip"><b>${data.summary.notRecorded}</b> لم يسجل</span>
          </div>

          <div class="inline-actions">
            ${state.date !== today
              ? html`<button class="btn btn--ghost btn--sm" type="button" data-action="today">
                  ${icon('calendar', 16)} اليوم
                </button>`
              : ''}
            <button class="btn btn--soft btn--sm" type="button" data-action="bulk">
              ${icon('checkCircle', 16)} حضور الجميع
            </button>
          </div>
        </section>

        <section class="card">
          <div class="filter-bar">
            <label class="search-field">
              ${icon('search', 18)}
              <input
                type="search"
                placeholder="ابحث بالاسم أو الرقم…"
                value="${state.query}"
                data-search
              >
            </label>
            <select class="select-field" data-branch aria-label="تصفية بالفرع">
              <option value="">كل الفروع</option>
              ${data.branches.map(
                (branch) => html`<option value="${branch}" ${branch === state.branch ? 'selected' : ''}>
                  ${branch}
                </option>`,
              )}
            </select>
          </div>

          <p class="filter-count muted" data-count>
            ${employees.length} موظف
          </p>

          ${employees.length
            ? html`<div class="list employee-list">
                ${employees.map((employee) => employeeRow(employee))}
              </div>`
            : emptyState({
                iconName: 'users',
                title: 'لا يوجد موظفون',
                text: state.query
                  ? 'لم يتم العثور على نتائج مطابقة للبحث.'
                  : 'لم يتم استيراد بيانات الموظفين من برنامج الرواتب بعد.',
              })}
        </section>

        <p class="page-foot">
          ${icon('info', 14)} اضغط على أي موظف لتغيير حالة حضوره لهذا اليوم.
        </p>
      </div>
    `,

    mount(root) {
      const changeDate = (next) => {
        if (!next || next > today) return;
        state.date = next;
        ctx.refresh();
      };

      root.querySelector('[data-action="prev-day"]')?.addEventListener('click', () => {
        changeDate(shiftDate(state.date, -1));
      });
      root.querySelector('[data-action="next-day"]')?.addEventListener('click', () => {
        changeDate(shiftDate(state.date, 1));
      });
      root.querySelector('[data-action="today"]')?.addEventListener('click', () => {
        changeDate(today);
      });

      root.querySelector('[data-branch]')?.addEventListener('change', (event) => {
        state.branch = event.target.value;
        ctx.refresh();
      });

      const search = root.querySelector('[data-search]');
      search?.addEventListener('input', () => {
        state.query = search.value;
        applySearch(root, state.query);
      });
      if (state.query) applySearch(root, state.query);

      root.querySelector('[data-action="bulk"]')?.addEventListener('click', () => bulkPresent(ctx));

      on(root, 'click', '[data-emp]', (event, node) => {
        const employee = data.employees.find((item) => item.id === node.dataset.emp);
        if (employee) openStatusSheet(ctx, employee, state.date);
      });
    },
  };
}

function employeeRow(employee) {
  const record = employee.record;
  const locked = employee.locked;

  return html`
    <button
      class="list-row list-row--tap employee-row"
      type="button"
      data-emp="${employee.id}"
      data-name="${`${employee.name} ${employee.id} ${employee.job || ''}`}"
    >
      ${avatar(employee, 44)}
      <span class="list-row__main">
        <b>${employee.name || employee.id}</b>
        <span>${[employee.job, employee.branch].filter(Boolean).join(' · ') || '—'}</span>
        ${record?.checkIn
          ? html`<small class="employee-row__time">${record.checkIn} — ${record.checkOut || '...'}</small>`
          : ''}
      </span>
      <span class="list-row__side">
        ${locked
          ? html`<span class="pill pill--muted">${icon('lock', 13)} ${employee.lockUntil}</span>`
          : record
            ? statusPill(record.st)
            : html`<span class="pill pill--muted">لم يسجل</span>`}
        ${!employee.hasAccount ? html`<small class="muted">بدون حساب</small>` : ''}
      </span>
    </button>
  `;
}

function applySearch(root, query) {
  const search = String(query || '').trim().toLowerCase();
  let visible = 0;

  root.querySelectorAll('[data-emp]').forEach((row) => {
    const matches = !search || row.dataset.name.toLowerCase().includes(search);
    row.hidden = !matches;
    if (matches) visible += 1;
  });

  const count = root.querySelector('[data-count]');
  if (count) count.textContent = `${visible} موظف`;
}

function filterEmployees(employees, query) {
  const search = String(query || '').trim().toLowerCase();
  if (!search) return employees;
  return employees.filter((employee) =>
    `${employee.name} ${employee.id} ${employee.job || ''}`.toLowerCase().includes(search),
  );
}

function openStatusSheet(ctx, employee, date) {
  if (employee.locked) {
    toast(`فترة هذا الموظف مقفولة حتى ${employee.lockUntil}`, 'info');
    return;
  }

  const current = employee.record?.st || 'none';

  openSheet({
    title: employee.name || employee.id,
    subtitle: `${formatDate(date, { year: undefined })} · ${employee.job || 'موظف'}`,
    submitLabel: 'حفظ الحالة',
    body: html`
      <label class="field">
        <span>حالة الحضور</span>
        <select name="status">
          ${STATUS_OPTIONS.map(
            (option) => html`<option value="${option.value}" ${option.value === current ? 'selected' : ''}>
              ${option.label}
            </option>`,
          )}
        </select>
      </label>
      <p class="hint">${icon('info', 16)} سيتم تحديث السجل مباشرة في برنامج الرواتب.</p>
    `,
    async onSubmit(formData) {
      const status = String(formData.get('status') || '');
      await api.post('/admin/attendance', {
        empId: employee.id,
        date,
        status,
      });
      toast(status === 'none' ? 'تم مسح تسجيل اليوم' : 'تم تحديث حالة الحضور');
      ctx.refresh();
      return true;
    },
  });
}

async function bulkPresent(ctx) {
  const label = state.branch ? `فرع ${state.branch}` : 'جميع الموظفين النشطين';
  const confirmed = await confirmSheet({
    title: 'تسجيل حضور الجميع',
    message: `سيتم تسجيل ${label} حاضرين يوم ${formatDate(state.date, { year: undefined })}. سيتم تخطي من لديه تسجيل بالفعل.`,
    confirmLabel: 'تأكيد التسجيل',
    iconName: 'checkCircle',
    iconTone: 'success',
  });
  if (!confirmed) return;

  try {
    const result = await api.post('/admin/attendance/bulk', {
      date: state.date,
      branch: state.branch,
    });
    toast(result.message);
    ctx.refresh();
  } catch (error) {
    toast(error.message, 'error');
  }
}
