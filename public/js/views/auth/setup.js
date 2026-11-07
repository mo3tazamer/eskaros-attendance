import { html, parseForm, busy } from '../../core/dom.js';
import { sessionApi } from '../../core/session.js';
import { icon } from '../../ui/icons.js';

export function setupView({ meta, onAuth }) {
  return {
    html: html`
      <div class="auth">
        <div class="auth__hero">
          <div class="brand-mark">${icon('shield', 34)}</div>
          <h1>${meta.companyName}</h1>
          <p>الخطوة الأولى: إنشاء حساب المدير</p>
        </div>

        <form class="card auth__card" data-form="setup" novalidate>
          <div class="auth__heading">
            <h2>إنشاء حساب المدير</h2>
            <p class="muted">
              سيُستخدم هذا الحساب لإدارة الموظفين والموافقة على السلف، ولفتح برنامج الرواتب.
            </p>
          </div>

          <label class="field">
            <span>اسم المستخدم</span>
            <input
              name="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              minlength="3"
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

          <p class="hint">${icon('info', 16)} كلمة المرور 6 أحرف على الأقل. احتفظ بها في مكان آمن.</p>
          <p class="form-error" data-error hidden></p>

          <button class="btn btn--primary btn--block" type="submit">
            <span class="btn__label">إنشاء الحساب والبدء</span>
          </button>
        </form>

        <p class="auth__foot">${icon('lock', 15)} سيتم حفظ البيانات على خادم الشركة المحلي.</p>
      </div>
    `,

    mount(root) {
      const form = root.querySelector('[data-form="setup"]');
      const errorBox = form.querySelector('[data-error]');
      const button = form.querySelector('button[type="submit"]');
      form.querySelector('input[name="username"]')?.focus({ preventScroll: true });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const { username, password, confirm } = parseForm(form);

        if (!username?.trim() || username.trim().length < 3) {
          showError('اسم المستخدم يجب أن يكون 3 أحرف على الأقل');
          return;
        }
        if (!password || password.length < 6) {
          showError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
          return;
        }
        if (password !== confirm) {
          showError('تأكيد كلمة المرور غير مطابق');
          return;
        }

        busy(button, true);
        hideError();
        try {
          const session = await sessionApi.setup(username.trim(), password, confirm);
          onAuth(session);
        } catch (error) {
          showError(error.message);
          busy(button, false);
        }
      });

      function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        const card = form.closest('.card');
        card?.classList.remove('shake');
        void card?.offsetWidth;
        card?.classList.add('shake');
      }

      function hideError() {
        errorBox.hidden = true;
        errorBox.textContent = '';
      }
    },
  };
}
