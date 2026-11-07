import { html } from '../core/dom.js';
import {
  LOAN_STATUS_LABELS,
  LOAN_STATUS_TONES,
  STATUS_LABELS,
  STATUS_TONES,
} from '../core/format.js';

export function statusPill(status) {
  const label = STATUS_LABELS[status] || status || '—';
  const tone = STATUS_TONES[status] || 'muted';
  return html`<span class="pill pill--${tone}">${label}</span>`;
}

export function loanStatusPill(status) {
  const label = LOAN_STATUS_LABELS[status] || status || '—';
  const tone = LOAN_STATUS_TONES[status] || 'muted';
  return html`<span class="pill pill--${tone}">${label}</span>`;
}
