import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { log } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';

const { Pool } = pg;

const COLLECTION_NAME = /^[A-Za-z0-9_]{1,64}$/;
const ID_MAX_LENGTH = 200;

/**
 * Postgres backend (Supabase / any Postgres) with the exact same sync API as
 * the file store. Documents live in memory and are flushed to the database,
 * so every service keeps working unchanged. If DATABASE_URL is not set,
 * the app falls back to JSON files — see server/index.js.
 */
export function createPool(connectionString) {
  const ssl = shouldUseSsl(connectionString);
  return new Pool({
    connectionString,
    max: 5,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });
}

function shouldUseSsl(connectionString) {
  try {
    const url = new URL(connectionString);
    return url.searchParams.get('sslmode') === 'require';
  } catch {
    return String(connectionString || '').includes('supabase.co');
  }
}

export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_documents (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_documents_collection
    ON app_documents (collection);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );
  `);
}

export function createPostgresStore({ pool, flushDelayMs = 120 }) {
  /** @type {Map<string, Map<string, object>>} */
  const collections = new Map();
  const dirty = new Map(); // collection -> Set<id> needing upsert
  const removed = new Map(); // collection -> Set<id> needing delete
  const listeners = new Set();
  let flushTimer = null;
  let writeChain = Promise.resolve();
  let disposed = false;

  async function load() {
    const { rows } = await pool.query(
      'SELECT collection, id, data FROM app_documents',
    );
    for (const row of rows) {
      if (!COLLECTION_NAME.test(String(row.collection || ''))) continue;
      if (!collections.has(row.collection)) collections.set(row.collection, new Map());
      collections.get(row.collection).set(String(row.id), row.data || {});
    }
  }

  function mapOf(name) {
    assertCollectionName(name);
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  function assertCollectionName(name) {
    if (!COLLECTION_NAME.test(String(name || ''))) {
      throw badRequest('اسم مجموعة غير صالح');
    }
  }

  function assertId(id) {
    const value = String(id ?? '');
    if (!value || value.length > ID_MAX_LENGTH || /[\u0000-\u001f]/.test(value)) {
      throw badRequest('معرّف غير صالح');
    }
    return value;
  }

  function clone(data) {
    return { ...data };
  }

  function markDirty(name, id) {
    if (!dirty.has(name)) dirty.set(name, new Set());
    dirty.get(name).add(id);
    const pending = removed.get(name);
    if (pending) pending.delete(id);
  }

  function markRemoved(name, id) {
    if (!removed.has(name)) removed.set(name, new Set());
    removed.get(name).add(id);
    const pending = dirty.get(name);
    if (pending) pending.delete(id);
  }

  function emit(name) {
    scheduleFlush();
    for (const listener of listeners) {
      try {
        listener(name);
      } catch (error) {
        log.warn('store listener failed:', error.message);
      }
    }
  }

  function scheduleFlush() {
    if (flushTimer || disposed) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch((error) => log.error('تعذّر حفظ البيانات:', error.message));
    }, flushDelayMs);
  }

  async function writeCollection(name, dirtyIds, removedIds) {
    if (dirtyIds.size) {
      const map = collections.get(name);
      const ids = [...dirtyIds].filter((id) => map?.has(id));
      if (ids.length) {
        const values = ids.map((id, i) => `($1, $${i + 2}, $${ids.length + i + 2}::jsonb)`);
        const params = [name];
        for (const id of ids) params.push(id);
        for (const id of ids) params.push(JSON.stringify(map.get(id) || {}));
        await pool.query(
          `INSERT INTO app_documents (collection, id, data, updated_at)
           VALUES ${values.join(', ')}
           ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          params,
        );
      }
    }
    if (removedIds.size) {
      await pool.query(
        'DELETE FROM app_documents WHERE collection = $1 AND id = ANY($2::text[])',
        [name, [...removedIds]],
      );
    }
  }

  function flush() {
    if (!dirty.size && !removed.size) return writeChain;
    const jobs = [];
    const names = new Set([...dirty.keys(), ...removed.keys()]);
    for (const name of names) {
      jobs.push({
        name,
        dirtyIds: dirty.get(name) || new Set(),
        removedIds: removed.get(name) || new Set(),
      });
    }
    dirty.clear();
    removed.clear();
    writeChain = writeChain.then(async () => {
      for (const job of jobs) await writeCollection(job.name, job.dirtyIds, job.removedIds);
    });
    return writeChain;
  }

  return {
    load,

    list(name) {
      return [...mapOf(name).entries()].map(([id, data]) => ({ id, ...clone(data) }));
    },

    raw(name) {
      return Object.fromEntries(
        [...mapOf(name).entries()].map(([id, data]) => [id, clone(data)]),
      );
    },

    get(name, id) {
      const data = mapOf(name).get(String(id));
      return data ? { id: String(id), ...clone(data) } : null;
    },

    has(name, id) {
      return mapOf(name).has(String(id));
    },

    count(name) {
      return mapOf(name).size;
    },

    set(name, id, data) {
      const key = assertId(id);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw badRequest('بيانات المستند غير صالحة');
      }
      const { id: _ignored, ...clean } = data;
      mapOf(name).set(key, clone(clean));
      markDirty(name, key);
      emit(name);
      return { id: key, ...clone(clean) };
    },

    add(name, data) {
      const id = randomUUID();
      return this.set(name, id, data);
    },

    update(name, id, patch) {
      const key = String(id);
      const map = mapOf(name);
      const current = map.get(key);
      if (!current) return null;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw badRequest('بيانات التعديل غير صالحة');
      }
      const { id: _ignored, ...clean } = patch;
      map.set(key, { ...current, ...clone(clean) });
      markDirty(name, key);
      emit(name);
      return { id: key, ...clone(map.get(key)) };
    },

    remove(name, id) {
      const removedFlag = mapOf(name).delete(String(id));
      if (removedFlag) {
        markRemoved(name, String(id));
        emit(name);
      }
      return removedFlag;
    },

    countWhere(name, predicate) {
      return this.list(name).filter(predicate).length;
    },

    snapshot(names) {
      const selected = names || [...collections.keys()];
      const out = {};
      for (const name of selected) out[name] = this.raw(name);
      return out;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    flush,

    async dispose() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flush();
      disposed = true;
    },
  };
}

export function createPostgresSessionStore({ pool, ttlMs }) {
  let sessions = new Map();
  let writeChain = Promise.resolve();
  let persistTimer = null;

  async function load() {
    const now = Date.now();
    const { rows } = await pool.query(
      'SELECT id, account_id, created_at, expires_at FROM app_sessions WHERE expires_at > $1',
      [now],
    );
    sessions = new Map(
      rows.map((row) => [
        row.id,
        {
          accountId: row.account_id,
          createdAt: Number(row.created_at),
          expiresAt: Number(row.expires_at),
        },
      ]),
    );
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist().catch((error) => log.error('تعذّر حفظ الجلسات:', error.message));
    }, 200);
  }

  async function persist() {
    const entries = [...sessions.entries()];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM app_sessions');
      for (const [id, session] of entries) {
        await client.query(
          'INSERT INTO app_sessions (id, account_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
          [id, session.accountId, session.createdAt, session.expiresAt],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    load,
    ttlMs,

    create(accountId) {
      const id = randomBytes(32).toString('base64url');
      const now = Date.now();
      sessions.set(id, { accountId, createdAt: now, expiresAt: now + ttlMs });
      schedulePersist();
      return id;
    },

    get(id) {
      if (!id) return null;
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        sessions.delete(id);
        schedulePersist();
        return null;
      }
      return { id, ...session };
    },

    destroy(id) {
      if (!id) return;
      if (sessions.delete(id)) schedulePersist();
    },

    destroyForAccount(accountId) {
      let changed = false;
      for (const [id, session] of sessions) {
        if (session.accountId === accountId) {
          sessions.delete(id);
          changed = true;
        }
      }
      if (changed) schedulePersist();
    },

    prune(now = Date.now()) {
      let changed = false;
      for (const [id, session] of sessions) {
        if (session.expiresAt <= now) {
          sessions.delete(id);
          changed = true;
        }
      }
      if (changed) schedulePersist();
    },

    async dispose() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      await persist();
    },
  };
}

