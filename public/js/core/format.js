const AR = 'ar-EG-u-nu-latn';

function dateFrom(value) {
  return value instanceof Date ? value : new Date(`${value}T12:00:00`);
}

export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat(AR, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(dateFrom(value));
}

export function formatShortDate(value, options = {}) {
  return new Intl.DateTimeFormat(AR, {
    day: 'numeric',
    month: 'short',
    ...options,
  }).format(dateFrom(value));
}

export function formatMonth(monthKey) {
  return new Intl.DateTimeFormat(AR, { month: 'long', year: 'numeric' }).format(
    dateFrom(`${monthKey}-01`),
  );
}

export function formatMoney(value, currency = 'ج.م') {
  const amount = Number(value) || 0;
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDuration(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(total / 60);
  const rest = Math.round(total % 60);
  if (!hours) return `${rest} دقيقة`;
  if (!rest) return `${hours} ساعة`;
  return `${hours} س ${rest} د`;
}

export function formatLate(minutes) {
  const value = Number(minutes) || 0;
  if (!value) return '';
  return `متأخر ${formatDuration(value)}`;
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(AR, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatClock(date, timeZone) {
  try {
    return new Intl.DateTimeFormat(AR, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(AR, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }
}

export function weekdayShort(value) {
  return new Intl.DateTimeFormat(AR, { weekday: 'short' }).format(dateFrom(value));
}

export function dayOfMonth(value) {
  return Number(String(value).slice(8, 10));
}

export function greeting(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return 'مرحبًا';
  if (value < 12) return 'صباح الخير';
  if (value < 18) return 'مساء الخير';
  return 'مساء النور';
}

export const STATUS_LABELS = {
  'حضور': 'حضور',
  'غياب': 'غياب',
  'إجازة': 'إجازة',
  'نص': 'نصف يوم',
};

export const STATUS_TONES = {
  'حضور': 'present',
  'غياب': 'absent',
  'إجازة': 'leave',
  'نص': 'half',
};

export const LOAN_STATUS_LABELS = {
  pending: 'قيد المراجعة',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export const LOAN_STATUS_TONES = {
  pending: 'warning',
  approved: 'present',
  rejected: 'absent',
  cancelled: 'muted',
};

export const LOAN_KIND_LABELS = {
  instant: 'خصم فوري',
  scheduled: 'أقساط',
};
