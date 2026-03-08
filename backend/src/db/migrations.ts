import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import db from '@/db';
import logger from '@/utils/logger';

const MIGRATION_LOCK_KEY_1 = 28472;
const MIGRATION_LOCK_KEY_2 = 91031;

type AppliedMigration = {
  name: string;
  checksum: string;
};

type PgError = {
  code?: string;
  message?: string;
};

function isBaselineSafeError(error: unknown): boolean {
  const pgError = error as PgError;
  return pgError.code === '42P07' || pgError.code === '42710';
}

function getMigrationsDir(): string {
  const projectRootMigrations = path.resolve(process.cwd(), 'db', 'migrations');
  if (fs.existsSync(projectRootMigrations)) {
    return projectRootMigrations;
  }

  // Works in both src execution and dist execution.
  return path.resolve(__dirname, '../../db/migrations');
}

function getMigrationFiles(migrationsDir: string): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
    .sort();
}

function getChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function runPendingMigrations(): Promise<void> {
  const client = await db.getClient();
  const migrationsDir = getMigrationsDir();

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [MIGRATION_LOCK_KEY_1, MIGRATION_LOCK_KEY_2]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<AppliedMigration>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name ASC'
    );

    const appliedMap = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));
    const hasMigrationHistory = appliedMap.size > 0;
    const migrationFiles = getMigrationFiles(migrationsDir);

    for (const migrationFile of migrationFiles) {
      const fullPath = path.join(migrationsDir, migrationFile);
      const migrationSql = fs.readFileSync(fullPath, 'utf8');
      const checksum = getChecksum(migrationSql);
      const appliedChecksum = appliedMap.get(migrationFile);

      if (appliedChecksum) {
        if (appliedChecksum !== checksum) {
          throw new Error(`Migration checksum mismatch: ${migrationFile}`);
        }
        continue;
      }

      logger.info(`Applying migration ${migrationFile}`);

      await client.query('BEGIN');
      try {
        await client.query(migrationSql);
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [migrationFile, checksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');

        // If schema exists but migration history is missing, bootstrap history for duplicate-object migrations.
        if (!hasMigrationHistory && isBaselineSafeError(error)) {
          logger.warn(`Baselining existing migration ${migrationFile}`);
          await client.query(
            'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
            [migrationFile, checksum]
          );
          continue;
        }

        throw error;
      }
    }

    logger.info(`Migration check complete (${migrationFiles.length} files)`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [MIGRATION_LOCK_KEY_1, MIGRATION_LOCK_KEY_2]);
    client.release();
  }
}
