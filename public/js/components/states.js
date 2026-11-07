import { html } from '../core/dom.js';
import { icon } from '../ui/icons.js';

export function pageSkeleton() {
  return html`
    <div class="stack" aria-hidden="true">
      <div class="skeleton skeleton--hero"></div>
      <div class="skeleton-row">
        <div class="skeleton skeleton--stat"></div>
        <div class="skeleton skeleton--stat"></div>
        <div class="skeleton skeleton--stat"></div>
      </div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--card"></div>
    </div>
  `;
}

export function errorView(message = 'تعذّر تحميل البيانات') {
  return html`
    <div class="card empty-state">
      <span class="empty-state__icon empty-state__icon--danger">${icon('alert', 30)}</span>
      <h2>حدثت مشكلة</h2>
      <p>${message}</p>
      <button class="btn btn--soft" type="button" data-action="retry">
        ${icon('refresh', 18)} إعادة المحاولة
      </button>
    </div>
  `;
}

export function emptyState({ iconName = 'info', title, text = '', action = null }) {
  return html`
    <div class="card empty-state">
      <span class="empty-state__icon">${icon(iconName, 28)}</span>
      <h3>${title}</h3>
      ${text ? html`<p>${text}</p>` : ''}
      ${action || ''}
    </div>
  `;
}
