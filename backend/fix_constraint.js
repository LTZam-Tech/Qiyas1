const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

async function run() {
  await client.connect();
  try {
    console.log("Dropping constraint...");
    await client.query('ALTER TABLE evidence_submissions DROP CONSTRAINT IF EXISTS evidence_submissions_status_check;');
    
    console.log("Recreating constraint...");
    await client.query("ALTER TABLE evidence_submissions ADD CONSTRAINT evidence_submissions_status_check CHECK (status::text = ANY (ARRAY['submitted'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'revision_required'::text]));");
    
    console.log("Done!");
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

run();
