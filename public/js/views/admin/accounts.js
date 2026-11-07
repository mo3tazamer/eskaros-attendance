import { api } from '../../core/api.js';
import { html, on } from '../../core/dom.js';
import { formatTimestamp } from '../../core/format.js';
import { emptyState } from '../../components/states.js';
import { avatar } from '../../ui/avatar.js';
import { icon } from '../../ui/icons.js';
import { confirmSheet, openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';

const state = {
  query: '',
};

export async function adminAccounts(ctx) {
  const data = await api.get('/admin/accounts');
  const employees = filterEmployees(data.employees, state.query);

  return {
    html: html`
      <div class="stack">
        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">حسابات الموظفين</h2>
              <p class="muted">${data.withAccount} حساب من ${data.total} موظف.</p>
            </div>
            <span class="pill pill--present">${data.withAccount} مفعّل</span>
          </div>

          <div class="summary-chips">
            <span class="summary-chip"><b>${data.total}</b> موظف</span>
            <span class="summary-chip summary-chip--present"><b>${data.withAccount}</b> لديه حساب</span>
            <span class="summary-chip summary-chip--warning"><b>${data.withoutAccount}</b> بدون حساب</span>
          </div>

          <label class="search-field">
            ${icon('search', 18)}
            <input
              type="search"
              placeholder="ابحث بالاسم أو الرقم أو الوظيفة…"
              value="${state.query}"
              data-search
            >
          </label>
          <p class="filter-count muted" data-count>${employees.length} موظف</p>
        </section>

        <section class="card">
          ${employees.length
            ? html`<div class="list">
                ${employees.map((employee) => accountRow(employee))}
              </div>`
            : emptyState({
                iconName: 'users',
                title: 'لا يوجد موظفون',
                text: state.query
                  ? 'لم يتم العثور على نتائج مطابقة للبحث.'
                  : 'استورد بيانات الموظفين من برنامج الرواتب أولًا.',
              })}
        </section>

        <p class="page-foot">
          ${icon('info', 14)} يستطيع الموظف تسجيل الحضور وتقديم طلبات السلف بعد إنشاء حسابه.
        </p>
      </div>
    `,

    mount(root) {
      const search = root.querySelector('[data-search]');
      search?.addEventListener('input', () => {
        state.query = search.value;
        applySearch(root, state.query);
      });

      on(root, 'click', '[data-emp]', (event, node) => {
        const employee = data.employees.find((item) => item.id === node.dataset.emp);
        if (!employee) return;
        if (employee.account) openManageAccount(ctx, employee, employee.account);
        else openCreateAccount(ctx, employee);
      });
    },
  };
}

function accountRow(employee) {
  const account = employee.account;

  return html`
    <button
      class="list-row list-row--tap account-row"
      type="button"
      data-emp="${employee.id}"
      data-name="${`${employee.name} ${employee.id} ${employee.job || ''}`}"
    >
      ${avatar(employee, 44)}
      <span class="list-row__main">
        <b>${employee.name || employee.id}</b>
        <span>${[employee.job, employee.branch].filter(Boolean).join(' · ') || '—'}</span>
        <small class="account-row__user">
          ${account ? `@${account.username}` : 'لا يوجد حساب بعد'}
        </small>
      </span>
      <span class="list-row__side">
        ${employee.active === false
          ? html`<span class="pill pill--muted">موقوف</span>`
          : account
            ? html`<span class="pill pill--${account.active ? 'present' : 'muted'}">
                ${account.active ? 'نشط' : 'معطّل'}
              </span>`
            : html`<span class="pill pill--warning">${icon('plus', 13)} إنشاء</span>`}
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

function suggestedUsername(employee) {
  const raw = String(employee.id || employee.name || 'user').toLowerCase();
  const cleaned = raw.replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, 40);
  return cleaned.length >= 3 ? cleaned : 'user';
}

function openCreateAccount(ctx, employee) {
  if (employee.active === false) {
    toast('لا يمكن إنشاء حساب لموظف موقوف', 'info');
    return;
  }

  openSheet({
    title: 'إنشاء حساب موظف',
    subtitle: employee.name || employee.id,
    submitLabel: 'إنشاء الحساب',
    body: html`
      <div class="form-grid">
        <label class="field">
          <span>اسم المستخدم</span>
          <input
            name="username"
            value="${suggestedUsername(employee)}"
            autocapitalize="none"
            spellcheck="false"
            minlength="3"
            maxlength="40"
            required
          >
        </label>
        <label class="field">
          <span>كلمة المرور</span>
          <input
            name="password"
            type="password"
            autocomplete="new-password"
            minlength="6"
            required
          >
        </label>
        <p class="hint">${icon('info', 16)} سلّم بيانات الدخول للموظف واطلب منه تغييرها لاحقًا.</p>
      </div>
    `,
    async onSubmit(formData) {
      const username = String(formData.get('username') || '').trim();
      const password = String(formData.get('password') || '');
      if (username.length < 3) throw new Error('اسم المستخدم 3 أحرف على الأقل');
      if (password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');

      const result = await api.post('/admin/accounts', {
        empId: employee.id,
        username,
        password,
      });
      toast(result.message);
      ctx.refresh();
      return true;
    },
  });
}

function openManageAccount(ctx, employee, account) {
  openSheet({
    title: account.username,
    subtitle: `${employee.name || employee.id} · ${account.active ? 'حساب نشط' : 'حساب معطّل'}`,
    submitLabel: 'تغيير كلمة المرور',
    body: html`
      <div class="kv-list">
        <div class="kv">
          <span class="kv__k">${icon('user', 17)} اسم المستخدم</span>
          <b class="kv__v">@${account.username}</b>
        </div>
        <div class="kv">
          <span class="kv__k">${icon('clock', 17)} آخر دخول</span>
          <b class="kv__v">${account.lastLoginAt ? formatTimestamp(account.lastLoginAt) : 'لم يسجل بعد'}</b>
        </div>
      </div>

      <label class="field">
        <span>كلمة مرور جديدة</span>
        <input
          name="password"
          type="password"
          autocomplete="new-password"
          minlength="6"
          placeholder="6 أحرف على الأقل"
          required
        >
      </label>

      <button class="btn btn--${account.active ? 'danger-soft' : 'soft'} btn--block" type="button" data-action="toggle">
        ${icon(account.active ? 'lock' : 'checkCircle', 17)}
        ${account.active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
      </button>
    `,
    async onSubmit(formData) {
      const password = String(formData.get('password') || '');
      if (password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
      const result = await api.post(`/admin/accounts/${account.id}/password`, { password });
      toast(result.message);
      return true;
    },
    onMount(form, close) {
      form.querySelector('[data-action="toggle"]')?.addEventListener('click', async () => {
        if (account.active) {
          const confirmed = await confirmSheet({
            title: 'تعطيل الحساب',
            message: `لن يستطيع ${employee.name || employee.username} تسجيل الدخول حتى تعيد تفعيله.`,
            confirmLabel: 'تعطيل الحساب',
            tone: 'danger',
            iconName: 'lock',
            iconTone: 'danger',
          });
          if (!confirmed) return;
        }

        try {
          const result = await api.post(`/admin/accounts/${account.id}/status`, {
            active: !account.active,
          });
          toast(result.message);
          close('submit');
          ctx.refresh();
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    },
  });
}
