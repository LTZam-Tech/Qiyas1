import db from './src/db';

async function migrate() {
  try {
    console.log('Adding evidence_type column via existing connection pool...');
    await db.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(50) DEFAULT 'file'
      CHECK (evidence_type IN ('file', 'screenshot'))
    `);
    console.log('Successfully completed schema migration!');
  } catch (err: any) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}

migrate();
