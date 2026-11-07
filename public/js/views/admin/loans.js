import { api } from '../../core/api.js';
import { html, on } from '../../core/dom.js';
import {
  LOAN_KIND_LABELS,
  LOAN_STATUS_LABELS,
  formatDate,
  formatMoney,
  formatTimestamp,
} from '../../core/format.js';
import { emptyState } from '../../components/states.js';
import { loanStatusPill } from '../../components/status.js';
import { avatar } from '../../ui/avatar.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';

const state = {
  status: 'pending',
};

const TABS = ['pending', 'approved', 'rejected', 'cancelled', 'all'];

export async function adminLoans(ctx) {
  const data = await api.get(`/admin/loans?status=${state.status}`);
  const currency = ctx.session.meta.currency || 'ج.م';
  const pendingTotal = ctx.session.badge?.pendingLoans || 0;

  return {
    html: html`
      <div class="stack">
        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">طلبات السلف</h2>
              <p class="muted">
                ${pendingTotal
                  ? `${pendingTotal} طلب ينتظر المراجعة.`
                  : 'لا توجد طلبات جديدة تنتظر المراجعة.'}
              </p>
            </div>
            <span class="pill pill--warning">${icon('clock', 14)} ${pendingTotal}</span>
          </div>

          <div class="segmented segmented--tabs" role="tablist">
            ${TABS.map(
              (tab) => html`
                <button
                  class="segment ${state.status === tab ? 'is-active' : ''}"
                  type="button"
                  role="tab"
                  aria-selected="${state.status === tab ? 'true' : 'false'}"
                  data-tab="${tab}"
                >
                  ${LOAN_STATUS_LABELS[tab] || 'الكل'}
                </button>
              `,
            )}
          </div>
        </section>

        ${data.requests.length
          ? html`<div class="stack stack--tight">
              ${data.requests.map((request) => requestCard(request, currency))}
            </div>`
          : emptyState({
              iconName: 'banknote',
              title: 'لا توجد طلبات',
              text:
                state.status === 'pending'
                  ? 'كل الطلبات تمت مراجعتها.'
                  : 'لا توجد طلبات بهذه الحالة.',
            })}

        <p class="page-foot">
          ${icon('info', 14)} اعتماد الطلب ينشئ سلفة في برنامج الرواتب تلقائيًا.
        </p>
      </div>
    `,

    mount(root) {
      on(root, 'click', '[data-tab]', (event, node) => {
        const next = node.dataset.tab;
        if (!next || next === state.status) return;
        state.status = next;
        ctx.refresh();
      });

      on(root, 'click', '[data-action="approve"]', (event, node) => {
        const request = data.requests.find((item) => item.id === node.dataset.id);
        if (request) openApprove(ctx, request, currency);
      });

      on(root, 'click', '[data-action="reject"]', (event, node) => {
        const request = data.requests.find((item) => item.id === node.dataset.id);
        if (request) openReject(ctx, request, currency);
      });
    },
  };
}

function requestCard(request, currency) {
  const pending = request.status === 'pending';
  const kind = LOAN_KIND_LABELS[request.kind] || request.kind;

  return html`
    <article class="request-card">
      <div class="request-card__head">
        <div class="request-card__who">
          ${avatar({ name: request.empName }, 44)}
          <div>
            <b>${request.empName || request.empId}</b>
            <span class="muted">${[request.job, request.branch].filter(Boolean).join(' · ') || 'موظف'}</span>
          </div>
        </div>
        ${loanStatusPill(request.status)}
      </div>

      <div class="request-card__amount">
        <b>${formatMoney(request.amount, currency)}</b>
        <span>${kind}${request.installments ? ` · ${request.installments} أقساط` : ''}</span>
      </div>

      ${request.note ? html`<p class="request-card__note">${request.note}</p>` : ''}

      <div class="request-card__meta">
        <span>${icon('calendar', 14)} ${formatDate(request.date, { year: undefined })}</span>
        <span>${icon('clock', 14)} ${formatTimestamp(request.requestedAt)}</span>
      </div>

      ${request.status === 'approved' && request.advance
        ? html`<div class="notice notice--success">
            ${icon('checkCircle', 17)}
            <span>سُجلت السلفة في الرواتب بتاريخ ${formatDate(request.advance.date, { year: undefined })}.</span>
          </div>`
        : ''}

      ${request.status !== 'pending' && (request.decidedBy || request.adminNote)
        ? html`<div class="notice notice--muted">
            ${icon('info', 16)}
            <span>
              ${request.decidedBy ? `راجعها ${request.decidedBy}` : 'تمت المراجعة'}
              ${request.adminNote ? ` — ${request.adminNote}` : ''}
            </span>
          </div>`
        : ''}

      ${pending
        ? html`<div class="action-row">
            <button class="btn btn--primary btn--sm" type="button" data-action="approve" data-id="${request.id}">
              ${icon('check', 16)} اعتماد
            </button>
            <button class="btn btn--danger-soft btn--sm" type="button" data-action="reject" data-id="${request.id}">
              ${icon('x', 16)} رفض
            </button>
          </div>`
        : ''}
    </article>
  `;
}

function openApprove(ctx, request, currency) {
  openSheet({
    title: 'اعتماد طلب السلفة',
    subtitle: `${request.empName} · ${formatMoney(request.amount, currency)}`,
    submitLabel: 'اعتماد وتسجيل في الرواتب',
    body: html`
      <label class="field">
        <span>ملاحظة الإدارة (اختياري)</span>
        <textarea name="note" rows="3" maxlength="200" placeholder="مثال: خصم من راتب هذا الشهر…"></textarea>
      </label>
      <div class="notice notice--success">
        ${icon('checkCircle', 17)}
        <span>سيتم إنشاء سلفة بقيمة ${formatMoney(request.amount, currency)} في برنامج الرواتب.</span>
      </div>
    `,
    async onSubmit(formData) {
      const result = await api.post(`/admin/loans/${request.id}/approve`, {
        note: String(formData.get('note') || ''),
      });
      toast(result.message);
      await ctx.refreshBadge();
      ctx.refresh();
      return true;
    },
  });
}

function openReject(ctx, request, currency) {
  openSheet({
    title: 'رفض طلب السلفة',
    subtitle: `${request.empName} · ${formatMoney(request.amount, currency)}`,
    submitLabel: 'رفض الطلب',
    tone: 'danger',
    body: html`
      <label class="field">
        <span>سبب الرفض (اختياري)</span>
        <textarea name="reason" rows="3" maxlength="200" placeholder="اكتب سبب الرفض ليظهر للموظف…"></textarea>
      </label>
      <div class="notice notice--warning">
        ${icon('alert', 17)}
        <span>لن تُسجَّل أي سلفة في برنامج الرواتب عند الرفض.</span>
      </div>
    `,
    async onSubmit(formData) {
      const result = await api.post(`/admin/loans/${request.id}/reject`, {
        reason: String(formData.get('reason') || ''),
      });
      toast(result.message);
      await ctx.refreshBadge();
      ctx.refresh();
      return true;
    },
  });
}
