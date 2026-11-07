import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log } from '../lib/logger.js';

const SESSION_ID_BYTES = 32;

/**
 * Opaque server-side sessions persisted to disk, so a restart of the local
 * server does not log every phone out.
 */
export function createSessionStore({ file, ttlMs }) {
  /** @type {Map<string, {accountId: string, createdAt: number, expiresAt: number}>} */
  let sessions = new Map();
  let writeChain = Promise.resolve();

  async function load() {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      const now = Date.now();
      sessions = new Map(
        Object.entries(parsed || {}).filter(([, value]) => value && value.expiresAt > now),
      );
      schedulePersist();
    } catch {
      sessions = new Map();
    }
  }

  function persist() {
    const data = Object.fromEntries(sessions);
    writeChain = writeChain.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(data), 'utf8');
      await fs.rename(temporary, file);
    });
    return writeChain.catch((error) => log.error('تعذّر حفظ الجلسات:', error.message));
  }

  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist();
    }, 200);
  }

  function prune(now = Date.now()) {
    let changed = false;
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now) {
        sessions.delete(id);
        changed = true;
      }
    }
    if (changed) schedulePersist();
  }

  return {
    load,
    ttlMs,

    create(accountId) {
      const id = randomBytes(SESSION_ID_BYTES).toString('base64url');
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

    prune,

    async dispose() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      prune();
      await persist();
    },
  };
}
