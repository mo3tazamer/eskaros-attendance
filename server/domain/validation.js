import { badRequest } from '../lib/errors.js';

export function text(value, { field = 'النص', min = 0, max = 200, trim = true } = {}) {
  const parsed = typeof value === 'string' ? (trim ? value.trim() : value) : '';
  if (parsed.length < min) throw badRequest(`${field} مطلوب`);
  if (parsed.length > max) throw badRequest(`${field} أطول من المسموح`);
  return parsed;
}

export function number(value, { field = 'الرقم', min = -Infinity, max = Infinity } = {}) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) throw badRequest(`${field} غير صالح`);
  if (parsed < min) throw badRequest(`${field} يجب ألا يقل عن ${min}`);
  if (parsed > max) throw badRequest(`${field} يجب ألا يزيد عن ${max}`);
  return parsed;
}

export function integer(value, options = {}) {
  const parsed = number(value, options);
  if (!Number.isInteger(parsed)) throw badRequest(`${options.field || 'الرقم'} يجب أن يكون عددًا صحيحًا`);
  return parsed;
}

export function oneOf(value, allowed, { field = 'القيمة' } = {}) {
  if (!allowed.includes(value)) throw badRequest(`${field} غير صالح`);
  return value;
}

export function password(value, { field = 'كلمة المرور' } = {}) {
  const parsed = typeof value === 'string' ? value : '';
  if (parsed.length < 6) throw badRequest(`${field} يجب أن تتكون من 6 أحرف على الأقل`);
  if (parsed.length > 128) throw badRequest(`${field} أطول من المسموح`);
  return parsed;
}

const USERNAME_PATTERN = /^[\p{L}\p{N}._-]{3,40}$/u;

export function username(value) {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (!USERNAME_PATTERN.test(parsed)) {
    throw badRequest('اسم المستخدم من 3 إلى 40 حرفًا، ويسمح بالحروف والأرقام و . _ -');
  }
  return parsed;
}
