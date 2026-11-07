import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log } from '../lib/logger.js';

/**
 * Daily server-side snapshot of every collection. The payroll program has its
 * own backup button, but the mobile-only collections (accounts, requests) need
 * one too. Fourteen daily files are kept.
 */
export function createAutoBackup({ store, dir, clock, keep = 14 }) {
  let timer = null;

  async function run() {
    try {
      await fs.mkdir(dir, { recursive: true });
      const body = JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          collections: store.snapshot(),
        },
        null,
        2,
      );
      const file = path.join(dir, `backup-${clock.today()}.json`);
      const temporary = `${file}.tmp`;
      await fs.writeFile(temporary, body, 'utf8');
      await fs.rename(temporary, file);
      await prune();
    } catch (error) {
      log.warn('تعذّر إنشاء النسخة الاحتياطية التلقائية:', error.message);
    }
  }

  async function prune() {
    const files = (await fs.readdir(dir))
      .filter((name) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();
    const extra = files.slice(0, Math.max(0, files.length - keep));
    for (const name of extra) await fs.rm(path.join(dir, name), { force: true });
  }

  function start() {
    run();
    timer = setInterval(run, 6 * 60 * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, run };
}
