import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Central runtime configuration. Every value can be overridden with an
 * environment variable, which keeps the code easy to run on another machine.
 *
 * Storage backends:
 * - Without DATABASE_URL: JSON files under DATA_DIR (local / LAN, no deps).
 * - With DATABASE_URL (e.g. Supabase): Postgres tables app_documents/app_sessions.
 */
export const config = {
  rootDir,
  publicDir: path.join(rootDir, 'public'),
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data'),
  backupDir: process.env.BACKUP_DIR || path.join(rootDir, 'backups'),
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000),
  maxJsonBytes: 2 * 1024 * 1024,
  maxPayrollBytes: 40 * 1024 * 1024,
  databaseUrl: process.env.DATABASE_URL || '',
};
