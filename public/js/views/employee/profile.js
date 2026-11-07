import { busy, html, on, parseForm, render } from '../../core/dom.js';
import { sessionApi } from '../../core/session.js';
import { formatDate } from '../../core/format.js';
import { avatar } from '../../ui/avatar.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';

export async function employeeProfile(ctx) {
  const { employee, account, meta } = ctx.session;
  const person = employee || {};

  return {
    html: html`
      <div class="stack">
        <section class="card profile-card">
          <div class="profile-card__head">
            ${avatar(person, 72)}
            <div>
              <h2>${person.name || account.name || ''}</h2>
              <p class="muted">${[person.job, person.branch].filter(Boolean).join(' · ') || 'موظف'}</p>
              <span class="pill">${person.type || '—'}</span>
            </div>
          </div>

          <div class="kv-list">
            <div class="kv">
              <span class="kv__k">${icon('user', 17)} اسم المستخدم</span>
              <b class="kv__v">${account.username}</b>
            </div>
            <div class="kv">
              <span class="kv__k">${icon('briefcase', 17)} رقم الموظف</span>
              <b class="kv__v">${person.id || '—'}</b>
            </div>
            <div class="kv">
              <span class="kv__k">${icon('building', 17)} الفرع</span>
              <b class="kv__v">${person.branch || '—'}</b>
            </div>
            <div class="kv">
              <span class="kv__k">${icon('clock', 17)} مواعيد العمل</span>
              <b class="kv__v">${meta.workStart} — ${meta.workEnd}</b>
            </div>
            <div class="kv">
              <span class="kv__k">${icon('calendar', 17)} اليوم</span>
              <b class="kv__v">${formatDate(meta.today, { year: undefined })}</b>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">تغيير كلمة المرور</h2>
              <p class="muted">احرص على استخدام كلمة مرور قوية لا تشاركها مع أحد.</p>
            </div>
          </div>

          <form class="form-grid" data-form="password" novalidate>
            <label class="field">
              <span>كلمة المرور الحالية</span>
              <span class="input-wrap">
                <input name="currentPassword" type="password" autocomplete="current-password" required>
                <button class="input-action" type="button" data-toggle="currentPassword" aria-label="إظهار كلمة المرور">
                  ${icon('eye', 20)}
                </button>
              </span>
            </label>

            <label class="field">
              <span>كلمة المرور الجديدة</span>
              <span class="input-wrap">
                <input name="nextPassword" type="password" autocomplete="new-password" minlength="6" required>
                <button class="input-action" type="button" data-toggle="nextPassword" aria-label="إظهار كلمة المرور">
                  ${icon('eye', 20)}
                </button>
              </span>
            </label>

            <label class="field">
              <span>تأكيد كلمة المرور الجديدة</span>
              <input name="confirm" type="password" autocomplete="new-password" minlength="6" required>
            </label>

            <p class="form-error" data-error hidden></p>

            <button class="btn btn--primary btn--block" type="submit">
              ${icon('key', 18)} حفظ كلمة المرور
            </button>
          </form>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">عن التطبيق</h2>
              <p class="muted">${meta.appName} — ${meta.companyName}</p>
            </div>
          </div>
          <div class="kv-list">
            <div class="kv">
              <span class="kv__k">${icon('sliders', 17)} الإصدار</span>
              <b class="kv__v">1.0.0</b>
            </div>
            <div class="kv">
              <span class="kv__k">${icon('clock', 17)} المنطقة الزمنية</span>
              <b class="kv__v">${meta.timezone}</b>
            </div>
          </div>
          <p class="page-foot">
            ${icon('lock', 14)} بياناتك محفوظة على خادم الشركة المحلي.
          </p>
        </section>

        <button class="btn btn--danger-soft btn--block" type="button" data-action="logout">
          ${icon('logOut', 18)} تسجيل الخروج
        </button>
      </div>
    `,

    mount(root) {
      const form = root.querySelector('[data-form="password"]');
      const errorBox = form.querySelector('[data-error]');
      const button = form.querySelector('button[type="submit"]');

      on(root, 'click', '[data-toggle]', (event, node) => {
        const input = form.querySelector(`input[name="${node.dataset.toggle}"]`);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        node.innerHTML = render(icon(show ? 'eyeOff' : 'eye', 20));
        node.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = parseForm(form);
        hideError();

        if (!input.currentPassword) return showError('أدخل كلمة المرور الحالية');
        if (!input.nextPassword || input.nextPassword.length < 6) {
          return showError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
        }
        if (input.nextPassword !== input.confirm) {
          return showError('تأكيد كلمة المرور غير مطابق');
        }

        busy(button, true);
        try {
          const result = await sessionApi.changePassword(
            input.currentPassword,
            input.nextPassword,
            input.confirm,
          );
          form.reset();
          toast(result.message);
        } catch (error) {
          showError(error.message);
        } finally {
          busy(button, false);
        }
      });

      function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
      }

      function hideError() {
        errorBox.hidden = true;
        errorBox.textContent = '';
      }

      root.querySelector('[data-action="logout"]')?.addEventListener('click', () => {
        document.querySelector('.app-header [data-action="logout"]')?.click();
      });
    },
  };
}
