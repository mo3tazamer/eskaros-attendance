#!/usr/bin/env node
/**
 * One-shot migration: copy local JSON collections (data/*.json) into Postgres.
 *
 * Usage:
 *   set DATABASE_URL=postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require
 *   npm install
 *   npm run db:migrate
 *
 * The script is idempotent (upserts by collection + id).
 * Run it BEFORE pointing the deployed app at the database, or right after —
 * whichever side already holds the data is the source of truth.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, ensureSchema } from '../server/data/postgres.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('DATABASE_URL is not set. Example: set DATABASE_URL=postgresql://...');
  process.exit(1);
}

const pool = createPool(connectionString);
await ensureSchema(pool);

let collections = 0;
let documents = 0;

const files = await fs.readdir(dataDir).catch(() => []);
for (const file of files) {
  if (!file.endsWith('.json')) continue;
  const name = file.slice(0, -5);
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) continue;

  if (name === 'sessions') {
    // Sessions → app_sessions table (expired ones are skipped)
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
      const now = Date.now();
      let count = 0;
      for (const [id, session] of Object.entries(parsed || {})) {
        if (!session || session.expiresAt <= now) continue;
        await pool.query(
          `INSERT INTO app_sessions (id, account_id, created_at, expires_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at`,
          [id, session.accountId, session.createdAt, session.expiresAt],
        );
        count += 1;
      }
      console.log(`sessions: ${count} (live)`);
    } catch (error) {
      console.warn(`sessions: skipped (${error.message})`);
    }
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
  } catch (error) {
    console.warn(`${name}: skipped (${error.message})`);
    continue;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

  const entries = Object.entries(parsed).filter(([id]) => id && id.length <= 200);
  for (const [id, data] of entries) {
    await pool.query(
      `INSERT INTO app_documents (collection, id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [name, id, JSON.stringify(data || {})],
    );
  }
  console.log(`${name}: ${entries.length} document(s)`);
  collections += 1;
  documents += entries.length;
}

console.log(`Done: ${documents} document(s) in ${collections} collection(s).`);
await pool.end();
