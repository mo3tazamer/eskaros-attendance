import { isValidTimeZone, timeToMinutes } from '../lib/time.js';
import { integer, oneOf, text } from '../domain/validation.js';
import { badRequest } from '../lib/errors.js';

export const DEFAULT_SETTINGS = Object.freeze({
  workStart: '09:00',
  workEnd: '17:00',
  lateGraceMinutes: 15,
  timezone: 'Africa/Cairo',
  currency: 'ج.م',
  appName: 'بوابة الموظفين',
});

export const TIMEZONES = Object.freeze([
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Amman',
  'Asia/Beirut',
  'Africa/Casablanca',
  'Africa/Tunis',
  'Europe/London',
]);

/**
 * App-specific settings live in `appSettings/main`. They are separate from the
 * payroll settings so the payroll backup stays untouched.
 */
export function createSettingsService({ store }) {
  function get() {
    const { id: _ignored, ...saved } = store.get('appSettings', 'main') || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  function update(input) {
    const current = get();
    const next = { ...current };

    if (input.workStart !== undefined) {
      if (timeToMinutes(input.workStart) === null) throw badRequest('وقت بداية العمل غير صالح');
      next.workStart = input.workStart;
    }
    if (input.workEnd !== undefined) {
      if (timeToMinutes(input.workEnd) === null) throw badRequest('وقت نهاية العمل غير صالح');
      next.workEnd = input.workEnd;
    }
    if (input.lateGraceMinutes !== undefined) {
      next.lateGraceMinutes = integer(input.lateGraceMinutes, {
        field: 'دقائق السماح',
        min: 0,
        max: 180,
      });
    }
    if (input.timezone !== undefined) {
      if (!isValidTimeZone(input.timezone)) throw badRequest('المنطقة الزمنية غير صالحة');
      next.timezone = input.timezone;
    }
    if (input.currency !== undefined) {
      next.currency = text(input.currency, { field: 'العملة', min: 1, max: 8 });
    }
    if (input.appName !== undefined) {
      next.appName = text(input.appName, { field: 'اسم التطبيق', min: 2, max: 40 });
    }

    store.set('appSettings', 'main', next);
    return get();
  }

  function company() {
    const brand = store.get('settings', 'brand') || {};
    return {
      name: brand.name || get().appName,
      hasLogo: Boolean(brand.logo),
    };
  }

  return { get, update, company, timezones: TIMEZONES, defaults: DEFAULT_SETTINGS };
}
