import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';

const COLLECTION_NAME = /^[A-Za-z0-9_]{1,64}$/;
const ID_MAX_LENGTH = 200;

/**
 * A tiny document store. Each collection is a JSON object keyed by document
 * id, held in memory and persisted with atomic writes. Writes are coalesced so
 * a bulk import (the payroll backup importer) does not rewrite the file per
 * document.
 */
export function createStore({ dir, flushDelayMs = 120 }) {
  /** @type {Map<string, Map<string, object>>} */
  const collections = new Map();
  const dirty = new Set();
  const listeners = new Set();
  let flushTimer = null;
  let writeChain = Promise.resolve();
  let disposed = false;

  async function load() {
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const name = file.slice(0, -5);
      // `sessions.json` belongs to the session store, not to a collection.
      if (name === 'sessions' || !COLLECTION_NAME.test(name)) continue;
      const fullPath = path.join(dir, file);
      try {
        const parsed = JSON.parse(await fs.readFile(fullPath, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('collection file must contain an object');
        }
        collections.set(name, new Map(Object.entries(parsed)));
      } catch (error) {
        log.warn(`تعذّر تحميل المجموعة ${name}:`, error.message);
      }
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

  function emit(name) {
    dirty.add(name);
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
      flush().catch((error) => log.error('تعذّر حفظ البيانات:', error));
    }, flushDelayMs);
  }

  async function writeCollection(name) {
    const map = collections.get(name);
    if (!map) return;
    const file = path.join(dir, `${name}.json`);
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(Object.fromEntries(map)), 'utf8');
    await fs.rename(temporary, file);
  }

  function flush() {
    if (!dirty.size) return writeChain;
    const names = [...dirty];
    dirty.clear();
    writeChain = writeChain.then(async () => {
      for (const name of names) await writeCollection(name);
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
      emit(name);
      return { id: key, ...clone(map.get(key)) };
    },

    remove(name, id) {
      const removed = mapOf(name).delete(String(id));
      if (removed) emit(name);
      return removed;
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
