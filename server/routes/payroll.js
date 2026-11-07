import { createRouter } from '../lib/router.js';
import { notFound } from '../lib/errors.js';
import { readJson, sendJson } from '../lib/http.js';

const PAYROLL_COLLECTIONS = new Set([
  'employees',
  'attendance',
  'advances',
  'closes',
  'settings',
  'adjust',
  'users',
  'docs',
]);

/**
 * Compatibility layer for the existing payroll HTML. Its `serverDB()` expects
 * these exact endpoints, so pointing it at this server makes attendance and
 * approved advances appear in the payroll program without changing its code.
 */
export function createPayrollRouter({ store, auth, config, sse }) {
  const router = createRouter();

  const guard = (req) => auth.requireAdmin(req);

  router.get('/payroll/api/ping', (req, res) => {
    guard(req);
    sendJson(res, 200, { ok: true, server: 'attendance' });
  });

  router.get('/payroll/api/c/:name', (req, res) => {
    guard(req);
    const name = req.params.name;
    if (!PAYROLL_COLLECTIONS.has(name) && !['accounts', 'loanRequests', 'appSettings', 'auditLog', 'notifications'].includes(name)) {
      throw notFound('المجموعة غير موجودة');
    }
    const docs = Object.entries(store.raw(name)).map(([id, data]) => ({ id, d: data }));
    sendJson(res, 200, docs);
  });

  router.post('/payroll/api/add', async (req, res) => {
    guard(req);
    const body = await readJson(req, config.maxPayrollBytes);
    const doc = store.add(assertCollection(body.c), body.data || {});
    sendJson(res, 200, { id: doc.id });
  });

  router.post('/payroll/api/set', async (req, res) => {
    guard(req);
    const body = await readJson(req, config.maxPayrollBytes);
    if (!body.id) throw notFound('معرّف المستند مطلوب');
    store.set(assertCollection(body.c), String(body.id), body.data || {});
    sendJson(res, 200, { ok: true, id: String(body.id) });
  });

  router.post('/payroll/api/update', async (req, res) => {
    guard(req);
    const body = await readJson(req, config.maxPayrollBytes);
    const updated = store.update(assertCollection(body.c), String(body.id), body.data || {});
    sendJson(res, 200, { ok: Boolean(updated) });
  });

  router.post('/payroll/api/delete', async (req, res) => {
    guard(req);
    const body = await readJson(req, config.maxPayrollBytes);
    const removed = store.remove(assertCollection(body.c), String(body.id));
    sendJson(res, 200, { ok: removed });
  });

  router.get('/payroll/api/events', (req, res) => {
    guard(req);
    sse.handle(req, res);
  });

  return {
    async handle(req, res) {
      const handled = await router.handle(req, res);
      if (!handled) {
        const pathname = new URL(req.url, 'http://local').pathname;
        if (pathname.startsWith('/payroll/api/')) throw notFound('المسار غير موجود');
      }
      return handled;
    },
  };
}

function assertCollection(name) {
  if (!PAYROLL_COLLECTIONS.has(name) && !['accounts', 'loanRequests', 'appSettings', 'auditLog', 'notifications'].includes(name)) {
    throw notFound('المجموعة غير موجودة');
  }
  return name;
}
