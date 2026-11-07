import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS,
  attendanceId,
  normalizeStatus,
  summarize,
} from '../server/domain/attendance.js';

test('normalizes payroll and mobile status spellings', () => {
  assert.equal(normalizeStatus('حضور'), STATUS.present);
  assert.equal(normalizeStatus('نص'), STATUS.half);
  assert.equal(normalizeStatus('نصف يوم'), STATUS.half);
  assert.equal(normalizeStatus('غياب'), STATUS.absent);
  assert.equal(normalizeStatus('إجازة'), STATUS.leave);
  assert.equal(normalizeStatus('anything'), null);
  assert.equal(normalizeStatus(undefined), null);
});

test('builds payroll-compatible document ids', () => {
  assert.equal(attendanceId('2026-11-07', 'EMP-001'), '2026-11-07_EMP-001');
});

test('summarizes a month of attendance records', () => {
  const summary = summarize([
    { st: STATUS.present, lateMinutes: 0 },
    { st: STATUS.present, lateMinutes: 12 },
    { st: STATUS.half, lateMinutes: 0 },
    { st: STATUS.leave },
    { st: STATUS.absent },
    { st: STATUS.absent },
  ]);

  assert.deepEqual(summary, {
    present: 2,
    late: 1,
    absent: 2,
    leave: 1,
    half: 1,
    recorded: 6,
    workDays: 2.5,
  });
});

test('summarizes an empty month', () => {
  assert.deepEqual(summarize([]), {
    present: 0,
    late: 0,
    absent: 0,
    leave: 0,
    half: 0,
    recorded: 0,
    workDays: 0,
  });
});
