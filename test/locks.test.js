import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocked, lastClosedDate, lockInfo } from '../server/domain/locks.js';

const closes = [
  { type: 'أسبوعي', to: '2026-10-31' },
  { type: 'أسبوعي', to: '2026-11-05' },
  { type: 'شهري', to: '2026-10-31' },
];

test('finds the latest closing date per employee type', () => {
  assert.equal(lastClosedDate(closes, 'أسبوعي'), '2026-11-05');
  assert.equal(lastClosedDate(closes, 'شهري'), '2026-10-31');
  assert.equal(lastClosedDate(closes, 'يومي'), '');
  assert.equal(lastClosedDate(null, 'أسبوعي'), '');
});

test('locks every date up to and including the closing date', () => {
  assert.equal(isLocked('2026-11-05', 'أسبوعي', closes), true);
  assert.equal(isLocked('2026-11-04', 'أسبوعي', closes), true);
  assert.equal(isLocked('2026-11-06', 'أسبوعي', closes), false);
  assert.equal(isLocked('2026-11-06', 'شهري', closes), false);
  assert.equal(isLocked('2026-11-06', 'يومي', closes), false);
  assert.equal(isLocked('2026-11-06', 'أسبوعي', []), false);
});

test('reports lock information', () => {
  assert.deepEqual(lockInfo(closes, 'أسبوعي'), { locked: true, until: '2026-11-05' });
  assert.deepEqual(lockInfo([], 'أسبوعي'), { locked: false, until: '' });
});
