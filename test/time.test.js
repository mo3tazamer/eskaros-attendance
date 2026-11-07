import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  dateRange,
  endOfMonth,
  isValidDate,
  isValidMonth,
  lateness,
  minutesToTime,
  monthOf,
  startOfMonth,
  timeToMinutes,
  workedMinutes,
} from '../server/lib/time.js';

test('validates calendar dates and months', () => {
  assert.equal(isValidDate('2026-11-07'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('07-11-2026'), false);
  assert.equal(isValidMonth('2026-11'), true);
  assert.equal(isValidMonth('2026-13'), false);
  assert.equal(monthOf('2026-11-07'), '2026-11');
});

test('moves through days and month boundaries', () => {
  assert.equal(addDays('2026-11-07', 1), '2026-11-08');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(startOfMonth('2026-11-07'), '2026-11-01');
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(endOfMonth('2024-02-10'), '2024-02-29');
  assert.deepEqual(dateRange('2026-11-01', '2026-11-03'), [
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
  ]);
});

test('converts times and calculates lateness', () => {
  assert.equal(timeToMinutes('09:15'), 555);
  assert.equal(timeToMinutes('24:00'), null);
  assert.equal(timeToMinutes('9:15'), null);
  assert.equal(minutesToTime(555), '09:15');
  assert.equal(minutesToTime(-10), '00:00');
  assert.equal(lateness('09:10', '09:00', 15), 0);
  assert.equal(lateness('09:20', '09:00', 15), 5);
  assert.equal(lateness('08:30', '09:00', 15), 0);
  assert.equal(lateness('bad', '09:00', 15), 0);
  assert.equal(workedMinutes('09:00', '17:30'), 510);
  assert.equal(workedMinutes('17:00', '09:00'), 0);
});
