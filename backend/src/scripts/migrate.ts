import { runPendingMigrations } from '@/db/migrations';
import db from '@/db';
import logger from '@/utils/logger';

async function main(): Promise<void> {
  let exitCode = 0;

  try {
    await runPendingMigrations();
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migrations failed', error);
    exitCode = 1;
  } finally {
    await db.close();
    process.exit(exitCode);
  }
}

void main();
