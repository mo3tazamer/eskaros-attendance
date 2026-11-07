import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAN_KIND,
  buildAdvance,
  openBalance,
  round2,
} from '../server/domain/loans.js';

const employee = { id: 'EMP-001', type: 'أسبوعي' };
const closes = [{ type: 'أسبوعي', to: '2026-10-31' }];

test('rounds money to two decimals', () => {
  assert.equal(round2(10.005), 10.01);
  assert.equal(round2('12.345'), 12.35);
  assert.equal(round2(0), 0);
});

test('keeps scheduled advances open until fully paid', () => {
  const advances = [
    { emp: 'EMP-001', kind: 'مجدولة', amount: 1000, paidAmt: 250 },
    { emp: 'EMP-001', kind: 'مجدولة', amount: 500, paidAmt: 0 },
  ];
  assert.equal(openBalance(advances, employee, closes), 1250);
});

test('closes instant advances with the payroll period', () => {
  const advances = [
    { emp: 'EMP-001', kind: 'فوري', amount: 300, date: '2026-10-20' },
    { emp: 'EMP-001', kind: 'فوري', amount: 200, date: '2026-11-04' },
    { emp: 'EMP-002', kind: 'فوري', amount: 900, date: '2026-11-04' },
  ];
  // 2026-10-20 is inside the closed period; only the open one counts.
  assert.equal(openBalance(advances, employee, closes), 200);
  assert.equal(openBalance(advances, null, closes), 0);
});

test('builds an instant advance compatible with payroll', () => {
  const advance = buildAdvance({
    employeeId: 'EMP-001',
    amount: 450,
    kind: LOAN_KIND.instant,
    date: '2026-11-07',
    note: 'سلفة',
    requestId: 'req-1',
  });

  assert.equal(advance.emp, 'EMP-001');
  assert.equal(advance.amount, 450);
  assert.equal(advance.kind, 'فوري');
  assert.equal(advance.date, '2026-11-07');
  assert.equal(advance.requestId, 'req-1');
  assert.equal(advance.n, undefined);
  assert.equal(advance.paid, undefined);
});

test('builds a scheduled advance with installment fields', () => {
  const advance = buildAdvance({
    employeeId: 'EMP-001',
    amount: 1200,
    kind: LOAN_KIND.scheduled,
    installments: 6,
    date: '2026-11-07',
    note: '',
    requestId: 'req-2',
  });

  assert.equal(advance.kind, 'مجدولة');
  assert.equal(advance.n, 6);
  assert.equal(advance.paid, 0);
  assert.equal(advance.paidAmt, 0);
});
