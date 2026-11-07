const partsCache = new Map();

function formatter(timeZone, options) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  if (!partsCache.has(key)) {
    partsCache.set(key, new Intl.DateTimeFormat('en-US', { timeZone, ...options }));
  }
  return partsCache.get(key);
}

function partsOf(date, timeZone) {
  const list = formatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const out = {};
  for (const part of list) if (part.type !== 'literal') out[part.type] = part.value;
  return out;
}

/** `YYYY-MM-DD` in the requested IANA time zone. */
export function dateIn(date, timeZone) {
  const p = partsOf(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** `HH:mm` in the requested IANA time zone (24 hour clock). */
export function timeIn(date, timeZone) {
  const p = partsOf(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && dateIn(date, 'UTC') === value;
}

export function isValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

export function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function startOfMonth(date) {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0, 12));
  return last.toISOString().slice(0, 10);
}

export function monthOf(date) {
  return date.slice(0, 7);
}

export function dateRange(from, to) {
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    out.push(day);
    if (out.length > 400) break;
  }
  return out;
}

/** Convert `HH:mm` to minutes since midnight. */
export function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(minutes) {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Minutes of lateness after the grace period. */
export function lateness(checkIn, workStart, graceMinutes = 0) {
  const inMinutes = timeToMinutes(checkIn);
  const startMinutes = timeToMinutes(workStart);
  if (inMinutes === null || startMinutes === null) return 0;
  return Math.max(0, inMinutes - startMinutes - Math.max(0, Number(graceMinutes) || 0));
}

export function workedMinutes(checkIn, checkOut) {
  const start = timeToMinutes(checkIn);
  const end = timeToMinutes(checkOut);
  if (start === null || end === null) return 0;
  return Math.max(0, end - start);
}

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
