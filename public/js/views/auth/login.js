import { html, parseForm, render, busy } from '../../core/dom.js';
import { sessionApi } from '../../core/session.js';
import { icon } from '../../ui/icons.js';

export function loginView({ meta, onAuth }) {
  return {
    html: html`
      <div class="auth">
        <div class="auth__hero">
          <div class="brand-mark">${icon('clock', 34)}</div>
          <h1>${meta.companyName}</h1>
          <p>${meta.appName}</p>
        </div>

        <form class="card auth__card" data-form="login" novalidate>
          <div class="auth__heading">
            <h2>تسجيل الدخول</h2>
            <p class="muted">استخدم اسم المستخدم وكلمة المرور الخاصة بك.</p>
          </div>

          <label class="field">
            <span>اسم المستخدم</span>
            <input
              name="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
            >
          </label>

          <label class="field">
            <span>كلمة المرور</span>
            <span class="input-wrap">
              <input
                name="password"
                type="password"
                autocomplete="current-password"
                required
              >
              <button
                class="input-action"
                type="button"
                data-action="toggle-password"
                aria-label="إظهار كلمة المرور"
              >
                ${icon('eye', 20)}
              </button>
            </span>
          </label>

          <p class="form-error" data-error hidden></p>

          <button class="btn btn--primary btn--block" type="submit">
            <span class="btn__label">دخول</span>
          </button>
        </form>

        <p class="auth__foot">${icon('lock', 15)} الدخول متاح للحسابات التي أنشأتها الإدارة فقط.</p>
      </div>
    `,

    mount(root) {
      const form = root.querySelector('[data-form="login"]');
      const errorBox = form.querySelector('[data-error]');
      const button = form.querySelector('button[type="submit"]');
      form.querySelector('input[name="username"]')?.focus({ preventScroll: true });

      form.querySelector('[data-action="toggle-password"]')?.addEventListener('click', (event) => {
        const input = form.querySelector('input[name="password"]');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        event.currentTarget.innerHTML = render(icon(show ? 'eyeOff' : 'eye', 20));
        event.currentTarget.setAttribute(
          'aria-label',
          show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور',
        );
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const { username, password } = parseForm(form);
        if (!username?.trim() || !password) {
          showError('أدخل اسم المستخدم وكلمة المرور');
          return;
        }

        busy(button, true);
        hideError();
        try {
          const session = await sessionApi.login(username.trim(), password);
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
