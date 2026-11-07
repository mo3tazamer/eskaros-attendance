import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPostgresSessionStore,
  createPostgresStore,
  ensureSchema,
} from '../server/data/postgres.js';

/**
 * In-memory stub that mimics the few Postgres statements used by the
 * production code. Lets us exercise the flush logic without a live database.
 */
function createStubPool() {
  const docs = new Map(); // `${collection}|${id}` -> data
  const sessions = new Map(); // id -> row

  const pool = {
    docs,
    sessions,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('create table') || normalized.startsWith('create index')) {
        return { rows: [] };
      }
      if (normalized.startsWith('select collection, id, data')) {
        const rows = [...docs.entries()].map(([key, data]) => {
          const sep = key.indexOf('|');
          return { collection: key.slice(0, sep), id: key.slice(sep + 1), data };
        });
        return { rows };
      }
      if (normalized.startsWith('insert into app_documents')) {
        const collection = params[0];
        const count = params.length > 1 ? (params.length - 1) / 2 : 0;
        for (let i = 0; i < count; i += 1) {
          const id = params[1 + i];
          const data = JSON.parse(params[1 + count + i]);
          docs.set(`${collection}|${id}`, data);
        }
        return { rows: [] };
      }
      if (normalized.startsWith('delete from app_documents')) {
        const [collection, ids] = params;
        for (const id of ids || []) docs.delete(`${collection}|${id}`);
        return { rows: [] };
      }
      if (normalized.startsWith('select id, account_id')) {
        const now = params[0] || 0;
        const rows = [...sessions.values()]
          .filter((row) => row.expires_at > now)
          .map((row) => ({ ...row }));
        return { rows };
      }
      if (normalized.startsWith('delete from app_sessions') && !normalized.includes('begin')) {
        sessions.clear();
        return { rows: [] };
      }
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
        return { rows: [] };
      }
      if (normalized.startsWith('insert into app_sessions')) {
        const [id, accountId, createdAt, expiresAt] = params;
        sessions.set(id, {
          id,
          account_id: accountId,
          created_at: createdAt,
          expires_at: expiresAt,
        });
        return { rows: [] };
      }
      throw new Error(`stub: unexpected SQL: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params) {
          return pool.query(sql, params);
        },
        release() {},
      };
    },
    async end() {},
  };
  return pool;
}

test('postgres store persists and reloads documents', async () => {
  const pool = createStubPool();
  await ensureSchema(pool);

  const first = createPostgresStore({ pool, flushDelayMs: 5 });
  await first.load();
  first.set('employees', 'EMP-001', { name: 'أحمد', active: true });
  const generated = first.add('attendance', { emp: 'EMP-001', st: 'حضور' });
  assert.match(generated.id, /^[0-9a-f-]{36}$/);
  await first.flush();
  assert.equal(pool.docs.size, 2);

  first.update('employees', 'EMP-001', { job: 'محاسب' });
  first.remove('attendance', generated.id);
  await first.flush();
  assert.equal(pool.docs.size, 1);
  assert.equal(pool.docs.get('employees|EMP-001').job, 'محاسب');

  const second = createPostgresStore({ pool, flushDelayMs: 5 });
  await second.load();
  assert.deepEqual(second.get('employees', 'EMP-001'), {
    id: 'EMP-001',
    name: 'أحمد',
    active: true,
    job: 'محاسب',
  });
  assert.equal(second.count('attendance'), 0);

  await first.dispose();
  await second.dispose();
});

test('postgres store ignores injected ids like the file store', async () => {
  const pool = createStubPool();
  const store = createPostgresStore({ pool, flushDelayMs: 5 });
  await store.load();

  store.set('users', 'u_1', { id: 'spoofed', name: 'admin' });
  assert.equal(store.get('users', 'u_1').id, 'u_1');
  assert.throws(() => store.set('users', '', { name: 'x' }), /معرّف غير صالح/);
  assert.throws(() => store.set('../bad', 'x', { name: 'x' }), /اسم مجموعة غير صالح/);

  await store.dispose();
});

test('postgres sessions persist and expire', async () => {
  const pool = createStubPool();
  const first = createPostgresSessionStore({ pool, ttlMs: 60_000 });
  await first.load();
  const id = first.create('acc-1');
  assert.equal(first.get(id).accountId, 'acc-1');

  // Force persistence (the stub shares the same underlying map).
  await first.dispose();
  assert.equal(pool.sessions.size, 1);

  const second = createPostgresSessionStore({ pool, ttlMs: 60_000 });
  await second.load();
  assert.equal(second.get(id).accountId, 'acc-1');

  second.destroy(id);
  await second.dispose();
  assert.equal(pool.sessions.size, 0);
  assert.equal(second.get(id), null);
});
