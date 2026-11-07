import { lastClosedDate } from './locks.js';

/**
 * Request kinds are stored in English inside the mobile app and translated to
 * the exact Arabic values the payroll program understands only when the
 * approved request becomes a real advance.
 */
export const LOAN_KIND = Object.freeze({
  instant: 'instant',
  scheduled: 'scheduled',
});

export const LOAN_KIND_LABEL = Object.freeze({
  [LOAN_KIND.instant]: 'تُخصم فورًا',
  [LOAN_KIND.scheduled]: 'مجدولة على أقساط',
});

export const LOAN_STATUS = Object.freeze({
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
});

export const LOAN_STATUS_LABEL = Object.freeze({
  [LOAN_STATUS.pending]: 'قيد المراجعة',
  [LOAN_STATUS.approved]: 'تمت الموافقة',
  [LOAN_STATUS.rejected]: 'مرفوض',
  [LOAN_STATUS.cancelled]: 'ملغي',
});

export const PAYROLL_KIND = Object.freeze({
  [LOAN_KIND.instant]: 'فوري',
  [LOAN_KIND.scheduled]: 'مجدولة',
});

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Mirrors the payroll `openOf` calculation: scheduled advances stay open until
 * all their installments are paid, while instant advances stay open only until
 * the period that contains them is closed.
 */
export function openBalance(advances, employee, closes) {
  if (!employee) return 0;
  const limit = lastClosedDate(closes, employee.type);
  return round2(
    advances
      .filter((advance) => advance.emp === employee.id)
      .reduce((total, advance) => {
        if (advance.kind === 'مجدولة') {
          return total + (Number(advance.amount) || 0) - (Number(advance.paidAmt) || 0);
        }
        return advance.date > limit ? total + (Number(advance.amount) || 0) : total;
      }, 0),
  );
}

/**
 * Builds a document that is byte-for-byte compatible with the payroll
 * `advances` collection.
 */
export function buildAdvance({ employeeId, amount, kind, installments, date, note, requestId }) {
  const base = {
    emp: employeeId,
    amount: round2(amount),
    date,
    note,
    kind: PAYROLL_KIND[kind],
    requestId,
    source: 'mobile',
    createdAt: Date.now(),
  };
  if (kind === LOAN_KIND.scheduled) {
    return { ...base, n: installments, paid: 0, paidAmt: 0 };
  }
  return base;
}
