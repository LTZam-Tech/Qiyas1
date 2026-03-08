const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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
    
    console.log('Dropping public schema to wipe database...');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();

    for (const migrationFile of migrationFiles) {
      console.log(`Applying ${migrationFile}...`);
      const migrationSql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf-8');
      await client.query(migrationSql);
    }

    console.log(`SUCCESS: Database rebuilt using ${migrationFiles.length} migration files.`);
  } catch (err) {
    console.error('Migration crashed:', err.message);
  } finally {
    await client.end();
  }
}

run();
