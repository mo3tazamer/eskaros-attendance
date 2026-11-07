import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { config } from './config.js';
import { log } from './lib/logger.js';
import { sendText } from './lib/http.js';
import { sendError } from './lib/http.js';
import { createStore } from './data/store.js';
import { createSessionStore } from './data/sessions.js';
import {
  createPool,
  createPostgresSessionStore,
  createPostgresStore,
  ensureSchema,
} from './data/postgres.js';
import { createSseHub } from './http/sse.js';
import { createStaticHandler } from './http/static.js';
import { createClock } from './lib/clock.js';
import { createSettingsService } from './services/settings.js';
import { createAuditService } from './services/audit.js';
import { createAuthService } from './services/auth.js';
import { createAttendanceService } from './services/attendance.js';
import { createLoansService } from './services/loans.js';
import { createAccountsService } from './services/accounts.js';
import { createDashboardService } from './services/dashboard.js';
import { createAutoBackup } from './services/backup.js';
import { createApiRouter } from './routes/api.js';
import { createPayrollRouter } from './routes/payroll.js';

// ---------------------------------------------------------------- storage
// Postgres (Supabase) when DATABASE_URL is set, JSON files otherwise.
let pool = null;
let store;
let sessions;

if (config.databaseUrl) {
  pool = createPool(config.databaseUrl);
  await ensureSchema(pool);
  store = createPostgresStore({ pool });
  sessions = createPostgresSessionStore({ pool, ttlMs: config.sessionTtlMs });
  log.info('التخزين: Postgres (Supabase) — DATABASE_URL');
} else {
  store = createStore({ dir: config.dataDir });
  sessions = createSessionStore({
    file: path.join(config.dataDir, 'sessions.json'),
    ttlMs: config.sessionTtlMs,
  });
  log.info('التخزين: ملفات JSON محلية');
}

await store.load();
await sessions.load();

const settings = createSettingsService({ store });
const clock = createClock(() => settings.get().timezone);
const audit = createAuditService({ store });
const auth = createAuthService({ store, sessions });
const sse = createSseHub(store);

const attendance = createAttendanceService({ store, clock, settings, audit });
const loans = createLoansService({ store, clock, audit });
const accounts = createAccountsService({ store, sessions, audit });
const dashboard = createDashboardService({ store, clock, settings });

const api = createApiRouter({
  auth,
  store,
  sessions,
  settings,
  clock,
  attendance,
  loans,
  accounts,
  dashboard,
  sse,
  config,
});
const payroll = createPayrollRouter({ store, auth, config, sse });
const serveStatic = createStaticHandler({ publicDir: config.publicDir, auth });

const server = createServer(async (req, res) => {
  try {
    // Cheap liveness probe for cloud hosts (Render, Railway, ...).
    // Keep it unauthenticated and free of any sensitive details.
    if (req.method === 'GET' && req.url === '/healthz') {
      sendText(res, 200, 'ok');
      return;
    }
    if (await api.handle(req, res)) return;
    if (await payroll.handle(req, res)) return;
    if (await serveStatic(req, res)) return;
    sendText(res, 404, 'الصفحة غير موجودة');
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(config.port, config.host, () => {
  const addresses = localAddresses();
  log.info('تم تشغيل بوابة الموظفين بنجاح');
  log.info(`على هذا الجهاز:  http://localhost:${config.port}`);
  for (const address of addresses) {
    log.info(`على الشبكة:      http://${address}:${config.port}`);
  }
  log.info(`مجلد البيانات:   ${config.dataDir}`);
  if (!auth.hasAdmin()) {
    log.info('أول تشغيل: افتح الرابط وأنشئ حساب المدير.');
  }
});

server.on('error', (error) => {
  log.error('تعذّر تشغيل الخادم:', error.message);
  if (error.code === 'EADDRINUSE') {
    log.error(`المنفذ ${config.port} مستخدم بالفعل. أغلق النسخة الأخرى أو غيّر PORT.`);
  }
  process.exitCode = 1;
});

const backup = createAutoBackup({
  store,
  dir: config.backupDir,
  clock,
});
backup.start();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`إيقاف الخادم (${signal})...`);
  backup.stop();
  sse.closeAll();
  server.close();
  try {
    await store.dispose();
    await sessions.dispose();
    if (pool) await pool.end();
  } catch (error) {
    log.error('تعذّر حفظ البيانات قبل الإيقاف:', error.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return out;
}
