import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../server/services/password.js';

test('hashes passwords with a unique salt and verifies them', async () => {
  const first = await hashPassword('secret123');
  const second = await hashPassword('secret123');

  assert.match(first, /^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('secret123', first), true);
  assert.equal(await verifyPassword('secret123', second), true);
  assert.equal(await verifyPassword('wrong', first), false);
});

test('rejects malformed or missing password hashes', async () => {
  assert.equal(await verifyPassword('secret123', null), false);
  assert.equal(await verifyPassword('secret123', 'plain-text'), false);
  assert.equal(await verifyPassword('secret123', 'scrypt$abc'), false);
  assert.equal(await verifyPassword('secret123', 'scrypt$@@@$@@@'), false);
});
