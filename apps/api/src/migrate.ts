import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
export async function migrate() {
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(951204)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  if (!(await client.query("SELECT 1 FROM schema_migrations WHERE version='001'")).rowCount) {
   await client.query(await readFile(new URL('../../../db/001_init.sql', import.meta.url),'utf8'));
   await client.query("INSERT INTO schema_migrations(version) VALUES ('001')");
  }
  await client.query('COMMIT');
 } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 try { await migrate(); console.log('Database migration complete'); } finally { await pool.end(); }
}
