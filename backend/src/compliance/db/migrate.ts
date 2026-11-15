/**
 * Migration runner for the Phase 1 "qiyas" schema.
 *
 * - Applies *.sql files from ./migrations in name order, each in its own transaction.
 * - Records name + SHA-256 in qiyas.schema_migrations.
 * - Refuses to continue when an applied file was edited afterwards (BR: reversible,
 *   version-controlled migrations — fix forward with a new file instead).
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export class MigrationChecksumError extends Error {
  constructor(public readonly migration: string) {
    super(`Migration ${migration} was changed after it was applied. Add a new migration instead of editing an applied one.`);
    this.name = 'MigrationChecksumError';
  }
}

const sha256 = (s: string) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');

/** SQL files are not compiled by tsc, so look next to this file first, then in the source tree. */
export function defaultMigrationsDir(): string {
  const candidates = [path.resolve(__dirname, 'migrations'), path.resolve(process.cwd(), 'src/compliance/db/migrations')];
  const found = candidates.find((d) => existsSync(d));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

export function loadMigrations(dir: string = defaultMigrationsDir()): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(dir, name), 'utf8');
      return { name, sql, checksum: sha256(sql) };
    });
}

export class DatabaseEncodingError extends Error {
  constructor(public readonly encoding: string) {
    super(`The database uses ${encoding} encoding. Qiyas stores Arabic and Urdu text and needs a UTF8 database (create it with ENCODING 'UTF8').`);
    this.name = 'DatabaseEncodingError';
  }
}

export async function migrate(db: Queryable, migrations: MigrationFile[] = loadMigrations()): Promise<string[]> {
  const enc = await db.query('SHOW server_encoding');
  const encoding = String(enc.rows[0]?.server_encoding ?? 'UTF8');
  if (encoding.toUpperCase() !== 'UTF8') throw new DatabaseEncodingError(encoding);
  await db.query('CREATE SCHEMA IF NOT EXISTS qiyas');
  await db.query(`CREATE TABLE IF NOT EXISTS qiyas.schema_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const { rows } = await db.query('SELECT name, checksum FROM qiyas.schema_migrations');
  const applied = new Map<string, string>(rows.map((r) => [r.name, r.checksum]));

  for (const m of migrations) {
    const prior = applied.get(m.name);
    if (prior !== undefined && prior !== m.checksum) throw new MigrationChecksumError(m.name);
  }

  const ran: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    await db.query('BEGIN');
    try {
      await db.query(m.sql);
      await db.query('INSERT INTO qiyas.schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum]);
      await db.query('COMMIT');
      ran.push(m.name);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
  return ran;
}
