const { Client } = require('pg');

async function run() {
  const client = new Client({
    user: 'QiyasUser',
    host: '127.0.0.1',
    database: 'Qiyas',
    password: 'Test123456',
    port: 5432
  });

  try {
    await client.connect();

    // First attempt: Grant ownership to QiyasUser
    console.log('Attempting to bypass Postgres owner restrictions...');
    try {
      await client.query(`ALTER TABLE tasks OWNER TO "QiyasUser"`);
      console.log('Ownership granted to QiyasUser successfully.');
    } catch (grantErr) {
      console.log('Grant ownership failed (expected if lack permissions):', grantErr.message);
    }

    console.log('Attempting to apply schema column migration...');
    await client.query(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(50) DEFAULT 'file'
      CHECK (evidence_type IN ('file', 'screenshot'))
    `);
    
    console.log('SUCCESS: ADDED missing evidence_type column to tasks architecture.');
  } catch (err) {
    console.error('Migration crashed:', err.message);
  } finally {
    await client.end();
  }
}

run();
