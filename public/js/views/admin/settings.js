import { api } from '../../core/api.js';
import { busy, html, parseForm } from '../../core/dom.js';
import { sessionApi } from '../../core/session.js';
import { formatDate } from '../../core/format.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';

export async function adminSettings(ctx) {
  const data = await api.get('/admin/settings');
  const { settings, timezones, company, server } = data;

  return {
    html: html`
      <div class="stack">
        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">إعدادات التطبيق</h2>
              <p class="muted">تتحكم في مواعيد العمل واحتساب التأخير.</p>
            </div>
            <span class="pill">${company.name}</span>
          </div>

          <form class="form-grid" data-form="settings" novalidate>
            <label class="field">
              <span>اسم التطبيق</span>
              <input name="appName" value="${settings.appName}" maxlength="40" required>
            </label>

            <div class="form-grid form-grid--2">
              <label class="field">
                <span>بداية العمل</span>
                <input name="workStart" type="time" value="${settings.workStart}" required>
              </label>
              <label class="field">
                <span>نهاية العمل</span>
                <input name="workEnd" type="time" value="${settings.workEnd}" required>
              </label>
            </div>

            <div class="form-grid form-grid--2">
              <label class="field">
                <span>دقائق السماح</span>
                <input
                  name="lateGraceMinutes"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="180"
                  value="${settings.lateGraceMinutes}"
                  required
                >
              </label>
              <label class="field">
                <span>العملة</span>
                <input name="currency" value="${settings.currency}" maxlength="8" required>
              </label>
            </div>

            <label class="field">
              <span>المنطقة الزمنية</span>
              <select name="timezone">
                ${timezones.map(
                  (zone) => html`<option value="${zone}" ${zone === settings.timezone ? 'selected' : ''}>
                    ${zone}
                  </option>`,
                )}
              </select>
            </label>

            <p class="hint">
              ${icon('info', 16)}
              يُحسب التأخير بعد ${settings.lateGraceMinutes} دقيقة من بداية العمل.
            </p>

            <button class="btn btn--primary btn--block" type="submit">
              ${icon('check', 18)} حفظ الإعدادات
            </button>
          </form>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">برنامج الرواتب</h2>
              <p class="muted">البيانات مشتركة مباشرة مع البرنامج.</p>
            </div>
          </div>

          <div class="kv-list">
            <div class="kv">
              <span class="kv__k">${icon('calendar', 17)} تاريخ الخادم</span>
              <b class="kv__v">${formatDate(server.today, { year: undefined })}</b>
            </div>
            <div class="kv">
              <span class="kv__k">${icon('clock', 17)} وقت الخادم</span>
              <b class="kv__v">${server.now} · ${server.timezone}</b>
            </div>
          </div>

          <div class="action-row">
            <a class="btn btn--soft" href="/payroll/">
              ${icon('briefcase', 17)} فتح برنامج الرواتب
            </a>
            <a class="btn btn--ghost" href="/api/app/admin/backup">
              ${icon('download', 17)} تنزيل نسخة احتياطية
            </a>
          </div>

          <p class="hint">
            ${icon('info', 16)}
            لاستيراد بيانات الرواتب: افتح البرنامج ← ملف البيانات ← استيراد نسخة احتياطية.
          </p>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">كلمة مرور المدير</h2>
              <p class="muted">تُحدَّث أيضًا في برنامج الرواتب تلقائيًا.</p>
            </div>
          </div>

          <form class="form-grid" data-form="password" novalidate>
            <label class="field">
              <span>كلمة المرور الحالية</span>
              <input name="currentPassword" type="password" autocomplete="current-password" required>
            </label>
            <div class="form-grid form-grid--2">
              <label class="field">
                <span>كلمة المرور الجديدة</span>
                <input
                  name="nextPassword"
                  type="password"
                  autocomplete="new-password"
                  minlength="6"
                  required
                >
              </label>
              <label class="field">
                <span>تأكيد كلمة المرور</span>
                <input
                  name="confirm"
                  type="password"
                  autocomplete="new-password"
                  minlength="6"
                  required
                >
              </label>
            </div>
            <p class="form-error" data-error hidden></p>
            <button class="btn btn--soft btn--block" type="submit">
              ${icon('key', 18)} تحديث كلمة المرور
            </button>
          </form>
        </section>

        <p class="page-foot">
          ${icon('lock', 14)} البيانات محفوظة محليًا على خادم الشركة.
        </p>
      </div>
    `,

    mount(root) {
      const form = root.querySelector('[data-form="settings"]');
      const button = form.querySelector('button[type="submit"]');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = parseForm(form);

        busy(button, true);
        try {
          const result = await api.put('/admin/settings', {
            appName: input.appName.trim(),
            workStart: input.workStart,
            workEnd: input.workEnd,
            lateGraceMinutes: Number(input.lateGraceMinutes),
            currency: input.currency.trim(),
            timezone: input.timezone,
          });
          toast(result.message);
          await ctx.reloadSession();
        } catch (error) {
          toast(error.message, 'error');
          busy(button, false);
        }
      });

      const passwordForm = root.querySelector('[data-form="password"]');
      const passwordButton = passwordForm.querySelector('button[type="submit"]');
      const errorBox = passwordForm.querySelector('[data-error]');

      passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = parseForm(passwordForm);
        errorBox.hidden = true;

        if (!input.currentPassword) {
          showPasswordError('أدخل كلمة المرور الحالية');
          return;
        }
        if (!input.nextPassword || input.nextPassword.length < 6) {
          showPasswordError('كلمة المرور الجديدة 6 أحرف على الأقل');
          return;
        }
        if (input.nextPassword !== input.confirm) {
          showPasswordError('تأكيد كلمة المرور غير مطابق');
          return;
        }

        busy(passwordButton, true);
        try {
          const result = await sessionApi.changePassword(
            input.currentPassword,
            input.nextPassword,
            input.confirm,
          );
          passwordForm.reset();
          toast(result.message);
        } catch (error) {
          showPasswordError(error.message);
        } finally {
          busy(passwordButton, false);
        }
      });

      function showPasswordError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
      }
    },
  };
}
