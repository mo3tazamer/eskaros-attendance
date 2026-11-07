import test from 'node:test';
import assert from 'node:assert/strict';
import { payrollPasswordHash, payrollUserId } from '../server/services/auth.js';

test('creates payroll user ids with the payroll hex convention', () => {
  assert.equal(payrollUserId('admin'), 'u_61646d696e');
  assert.equal(payrollUserId('Admin'), 'u_61646d696e');
  assert.equal(payrollUserId('محمد'), `u_${Buffer.from('محمد', 'utf8').toString('hex')}`);
});

test('reproduces the payroll password hash', () => {
  assert.equal(
    payrollPasswordHash('admin', 'admin123'),
    '34d4333523d76ee459843e9517f7d90172e3ee436d40aa29c427054b80c11243',
  );
  assert.equal(
    payrollPasswordHash('ADMIN', 'admin123'),
    payrollPasswordHash('admin', 'admin123'),
  );
});
