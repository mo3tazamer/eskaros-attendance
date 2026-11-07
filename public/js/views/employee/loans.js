import { api } from '../../core/api.js';
import { busy, html, on } from '../../core/dom.js';
import {
  LOAN_KIND_LABELS,
  formatDate,
  formatMoney,
  formatTimestamp,
} from '../../core/format.js';
import { emptyState } from '../../components/states.js';
import { loanStatusPill } from '../../components/status.js';
import { icon } from '../../ui/icons.js';
import { confirmSheet, openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';

export async function employeeLoans(ctx) {
  const data = await api.get('/employee/loans');
  const currency = ctx.session.meta.currency || 'ج.م';
  const pending = data.pending;

  return {
    html: html`
      <div class="stack">
        <section class="balance-hero">
          <div class="balance-hero__top">
            <span class="balance-hero__label">${icon('wallet', 16)} إجمالي السلف المفتوحة</span>
            <span class="badge-soft">${data.requests.length} طلب</span>
          </div>
          <b class="balance-hero__value">${formatMoney(data.openBalance, currency)}</b>
          <p class="balance-hero__meta">
            ${pending
              ? `لديك طلب بقيمة ${formatMoney(pending.amount, currency)} قيد مراجعة الإدارة.`
              : 'لا توجد طلبات قيد المراجعة حاليًا.'}
          </p>
          <button class="btn btn--light btn--block" type="button" data-action="new-loan">
            ${icon('plus', 18)} تقديم طلب سلفة
          </button>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">طلباتي</h2>
              <p class="muted">تابع حالة كل طلب قدّمته.</p>
            </div>
          </div>

          ${data.requests.length
            ? html`<div class="list">
                ${data.requests.map((request) => requestCard(request, currency))}
              </div>`
            : emptyState({
                iconName: 'banknote',
                title: 'لا توجد طلبات',
                text: 'تقدّم بطلب سلفة جديد وسيظهر هنا بعد إرساله للإدارة.',
              })}
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <h2 class="section-title">السلف المسجلة</h2>
              <p class="muted">السلف المعتمدة في برنامج الرواتب.</p>
            </div>
          </div>

          ${data.advances.length
            ? html`<div class="advance-list">
                ${data.advances.map(
                  (advance) => html`
                    <div class="advance-row">
                      <span class="icon-chip icon-chip--blue">${icon('banknote', 18)}</span>
                      <div class="advance-row__main">
                        <b>${formatMoney(advance.amount, currency)}</b>
                        <span>
                          ${LOAN_KIND_LABELS[advance.kind] || advance.kind}
                          ${advance.installments ? ` · ${advance.installments} أقساط` : ''}
                        </span>
                      </div>
                      <div class="advance-row__side">
                        <span>${formatDate(advance.date, { year: undefined })}</span>
                        ${advance.kind === 'scheduled'
                          ? html`<small>متبقي ${formatMoney(
                              advance.amount - advance.paidAmount,
                              currency,
                            )}</small>`
                          : ''}
                      </div>
                    </div>
                  `,
                )}
              </div>`
            : emptyState({
                iconName: 'wallet',
                title: 'لا توجد سلف مسجلة',
                text: 'عند اعتماد الإدارة لطلبك سيُسجَّل تلقائيًا في برنامج الرواتب.',
              })}
        </section>

        <p class="page-foot">
          ${icon('info', 14)} تُسجَّل السلفة في برنامج الرواتب فور موافقة الإدارة.
        </p>
      </div>
    `,

    mount(root) {
      root
        .querySelector('[data-action="new-loan"]')
        ?.addEventListener('click', () => openNewLoan(ctx, Boolean(pending)));

      on(root, 'click', '[data-action="cancel-loan"]', async (event, node) => {
        const id = node.dataset.id;
        const confirmed = await confirmSheet({
          title: 'إلغاء طلب السلفة',
          message: 'سيتم إلغاء الطلب نهائيًا ولا يمكن التراجع. هل تريد المتابعة؟',
          confirmLabel: 'نعم، إلغاء الطلب',
          tone: 'danger',
          iconName: 'xCircle',
          iconTone: 'danger',
        });
        if (!confirmed) return;

        busy(node, true);
        try {
          const result = await api.post(`/employee/loans/${id}/cancel`);
          toast(result.message);
          ctx.refresh();
        } catch (error) {
          toast(error.message, 'error');
          busy(node, false);
        }
      });
    },
  };
}

function requestCard(request, currency) {
  const kind = LOAN_KIND_LABELS[request.kind] || request.kind;
  const canCancel = request.status === 'pending';

  return html`
    <article class="request-card">
      <div class="request-card__head">
        <div class="request-card__who">
          <span class="icon-chip icon-chip--blue">${icon('banknote', 19)}</span>
          <div>
            <b>${formatMoney(request.amount, currency)}</b>
            <span class="muted">${kind}${request.installments ? ` · ${request.installments} أقساط` : ''}</span>
          </div>
        </div>
        ${loanStatusPill(request.status)}
      </div>

      ${request.note
        ? html`<p class="request-card__note">${request.note}</p>`
        : ''}

      <div class="request-card__meta">
        <span>${icon('calendar', 14)} ${formatDate(request.date, { year: undefined })}</span>
        <span>${icon('clock', 14)} ${formatTimestamp(request.requestedAt)}</span>
      </div>

      ${request.status !== 'pending' && (request.adminNote || request.decidedBy)
        ? html`<div class="notice notice--muted">
            ${icon('info', 16)}
            <span>
              ${request.decidedBy ? `راجعها ${request.decidedBy}` : 'تمت المراجعة'}
              ${request.adminNote ? ` — ${request.adminNote}` : ''}
            </span>
          </div>`
        : ''}

      ${canCancel
        ? html`<button
            class="btn btn--danger-soft btn--sm"
            type="button"
            data-action="cancel-loan"
            data-id="${request.id}"
          >
            ${icon('x', 16)} إلغاء الطلب
          </button>`
        : ''}
    </article>
  `;
}

function openNewLoan(ctx, hasPending) {
  if (hasPending) {
    toast('لديك طلب قيد المراجعة بالفعل', 'info');
    return;
  }

  const currency = ctx.session.meta.currency || 'ج.م';

  openSheet({
    title: 'طلب سلفة جديدة',
    subtitle: 'سيُراجع الطلب من الإدارة قبل تسجيله في الرواتب.',
    submitLabel: 'إرسال الطلب',
    body: html`
      <div class="form-grid">
        <label class="field">
          <span>المبلغ (${currency})</span>
          <input
            name="amount"
            type="number"
            inputmode="decimal"
            min="1"
            step="0.01"
            placeholder="0.00"
            required
          >
        </label>

        <div class="field">
          <span>طريقة السداد</span>
          <div class="segmented" role="radiogroup" aria-label="طريقة السداد">
            <label class="segment">
              <input type="radio" name="kind" value="instant" checked>
              <span>خصم فوري</span>
            </label>
            <label class="segment">
              <input type="radio" name="kind" value="scheduled">
              <span>على أقساط</span>
            </label>
          </div>
        </div>

        <label class="field" data-installments hidden>
          <span>عدد الأقساط</span>
          <input name="installments" type="number" inputmode="numeric" min="2" max="52" value="6">
        </label>

        <label class="field">
          <span>سبب السلفة (اختياري)</span>
          <textarea name="note" rows="3" maxlength="200" placeholder="اكتب سببًا مختصرًا…"></textarea>
        </label>

        <p class="hint">${icon('info', 16)} يمكنك إلغاء الطلب قبل مراجعته من الإدارة.</p>
      </div>
    `,
    onMount(form) {
      const installments = form.querySelector('[data-installments]');
      const toggle = () => {
        const kind = form.querySelector('input[name="kind"]:checked')?.value;
        installments.hidden = kind !== 'scheduled';
      };
      form.querySelectorAll('input[name="kind"]').forEach((input) => {
        input.addEventListener('change', toggle);
      });
      toggle();
    },
    async onSubmit(formData) {
      const input = Object.fromEntries(formData.entries());
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount < 1) {
        throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر');
      }
      if (input.kind === 'scheduled') {
        const count = Number(input.installments);
        if (!Number.isInteger(count) || count < 2 || count > 52) {
          throw new Error('عدد الأقساط يجب أن يكون بين 2 و52');
        }
      }

      const result = await api.post('/employee/loans', {
        amount,
        kind: input.kind,
        installments: input.kind === 'scheduled' ? Number(input.installments) : null,
        note: input.note || '',
      });
      toast(result.message);
      ctx.refresh();
      return true;
    },
  });
}
