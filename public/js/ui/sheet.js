import { html, render } from '../core/dom.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

let openCount = 0;

/**
 * Accessible bottom sheet with an optional form. `onSubmit` can be async; the
 * sheet closes on success and stays open with an error toast on failure.
 */
export function openSheet({
  title,
  subtitle = '',
  body,
  submitLabel = 'حفظ',
  cancelLabel = 'إلغاء',
  tone = 'primary',
  hideSubmit = false,
  onSubmit = null,
  onMount = null,
  onClose = null,
}) {
  const root = document.getElementById('sheet-root');
  const previousFocus = document.activeElement;
  const wrapper = document.createElement('div');
  wrapper.className = 'sheet-backdrop';
  wrapper.innerHTML = render(html`
    <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" novalidate>
      <div class="sheet__handle"></div>
      <header class="sheet__head">
        <div class="sheet__heading">
          <h2 id="sheet-title">${title}</h2>
          ${subtitle ? html`<p class="muted">${subtitle}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-sheet-close aria-label="إغلاق">
          ${icon('x', 20)}
        </button>
      </header>
      <div class="sheet__body">${body}</div>
      <footer class="sheet__actions">
        <button type="button" class="btn btn--ghost" data-sheet-close>${cancelLabel}</button>
        ${hideSubmit
          ? ''
          : html`<button type="submit" class="btn btn--${tone}">
              <span class="btn__label">${submitLabel}</span>
            </button>`}
      </footer>
    </form>
  `);

  const form = wrapper.querySelector('form');
  let closed = false;
  let closingReason = 'dismiss';

  root.append(wrapper);
  document.body.classList.add('sheet-open');
  openCount += 1;
  requestAnimationFrame(() => wrapper.classList.add('is-open'));

  function close(reason = 'dismiss') {
    if (closed) return;
    closed = true;
    closingReason = reason;
    wrapper.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    openCount = Math.max(0, openCount - 1);
    if (openCount > 0) document.body.classList.add('sheet-open');

    window.setTimeout(() => {
      wrapper.remove();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      if (typeof onClose === 'function') onClose(closingReason);
    }, 180);
  }

  wrapper.addEventListener('click', (event) => {
    if (event.target === wrapper) close('backdrop');
    if (event.target.closest('[data-sheet-close]')) close('cancel');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit) {
      close('submit');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button?.classList.add('is-loading');
    if (button) button.disabled = true;
    try {
      const result = await onSubmit(new FormData(form), form, close);
      if (result !== false) close('submit');
    } catch (error) {
      toast(error.message || 'تعذّر إتمام العملية', 'error');
      if (button) {
        button.disabled = false;
      }
    } finally {
      button?.classList.remove('is-loading');
    }
  });

  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close('escape');
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [
      ...wrapper.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (typeof onMount === 'function') onMount(form, close, wrapper);

  window.setTimeout(() => {
    const target = form.querySelector('input:not([type="hidden"]), select, textarea') ||
      form.querySelector('button[type="submit"]');
    target?.focus({ preventScroll: true });
  }, 60);

  return { close, form, wrapper };
}

export function confirmSheet({
  title,
  message,
  confirmLabel = 'تأكيد',
  tone = 'primary',
  iconName = 'alert',
  iconTone = 'warning',
}) {
  return new Promise((resolve) => {
    let confirmed = false;
    openSheet({
      title,
      body: html`
        <div class="confirm">
          <span class="confirm__icon confirm__icon--${iconTone}">${icon(iconName, 26)}</span>
          <p>${message}</p>
        </div>
      `,
      submitLabel: confirmLabel,
      tone,
      onSubmit: () => {
        confirmed = true;
        return true;
      },
      onClose: () => resolve(confirmed),
    });
  });
}

export function closeAllSheets() {
  document.querySelectorAll('.sheet-backdrop').forEach((node) => node.remove());
  document.body.classList.remove('sheet-open');
  openCount = 0;
}
