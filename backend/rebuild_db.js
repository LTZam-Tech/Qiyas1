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
    
    console.log('Applying 0001_init.sql...');
    const initSql = fs.readFileSync(path.join(__dirname, 'db', 'migrations', '0001_init.sql'), 'utf-8');
    await client.query(initSql);

    console.log('Applying 0002_seed_rbac.sql...');
    const seedSql = fs.readFileSync(path.join(__dirname, 'db', 'migrations', '0002_seed_rbac.sql'), 'utf-8');
    await client.query(seedSql);

    console.log('SUCCESS: Database rebuilt with correct evidence_type schema!');
  } catch (err) {
    console.error('Migration crashed:', err.message);
  } finally {
    await client.end();
  }
}

run();
