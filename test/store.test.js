import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/data/store.js';

async function temporaryDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'attendance-store-'));
}

test('stores, updates and removes documents', async () => {
  const dir = await temporaryDir();
  const store = createStore({ dir, flushDelayMs: 5 });
  await store.load();

  const created = store.set('employees', 'EMP-001', { name: 'أحمد', active: true });
  assert.deepEqual(created, { id: 'EMP-001', name: 'أحمد', active: true });
  assert.equal(store.get('employees', 'EMP-001').name, 'أحمد');

  const updated = store.update('employees', 'EMP-001', { job: 'محاسب', active: false });
  assert.equal(updated.job, 'محاسب');
  assert.equal(updated.active, false);
  assert.equal(updated.name, 'أحمد');

  const generated = store.add('attendance', { emp: 'EMP-001', st: 'حضور' });
  assert.match(generated.id, /^[0-9a-f-]{36}$/);
  assert.equal(store.count('attendance'), 1);

  assert.equal(store.remove('attendance', generated.id), true);
  assert.equal(store.remove('attendance', generated.id), false);
  assert.equal(store.count('attendance'), 0);

  await store.dispose();
  await fs.rm(dir, { recursive: true, force: true });
});

test('ignores injected ids and rejects invalid document ids', async () => {
  const dir = await temporaryDir();
  const store = createStore({ dir });
  await store.load();

  store.set('users', 'u_1', { id: 'spoofed', name: 'admin' });
  assert.equal(store.get('users', 'u_1').id, 'u_1');
  assert.equal(store.get('users', 'u_1').name, 'admin');

  assert.throws(() => store.set('users', '', { name: 'x' }), /معرّف غير صالح/);
  assert.throws(() => store.set('../bad', 'x', { name: 'x' }), /اسم مجموعة غير صالح/);

  await store.dispose();
  await fs.rm(dir, { recursive: true, force: true });
});

test('persists collections atomically and reloads them', async () => {
  const dir = await temporaryDir();
  const first = createStore({ dir, flushDelayMs: 5 });
  await first.load();
  first.set('advances', 'a1', { emp: 'EMP-001', amount: 100, kind: 'فوري' });
  await first.flush();
  await first.dispose();

  const second = createStore({ dir });
  await second.load();
  assert.deepEqual(second.get('advances', 'a1'), {
    id: 'a1',
    emp: 'EMP-001',
    amount: 100,
    kind: 'فوري',
  });
  assert.deepEqual(second.snapshot(['advances']), {
    advances: { a1: { emp: 'EMP-001', amount: 100, kind: 'فوري' } },
  });

  await second.dispose();
  await fs.rm(dir, { recursive: true, force: true });
});
