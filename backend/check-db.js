const { Pool } = require('pg');
const config = require('./dist/config').default;

async function checkDb() {
  const pool = new Pool(config.database);
  try {
    const sql = require('fs').readFileSync('db/migrations/0002_seed_rbac.sql', 'utf8');
    await pool.query(sql);
    console.log("Migration 0002_seed_rbac.sql executed successfully.");  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkDb();
