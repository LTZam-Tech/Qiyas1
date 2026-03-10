const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

client.connect()
  .then(() => client.query(`
    SELECT pg_get_constraintdef(c.oid) AS constraint_def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'evidence_submissions' AND c.conname = 'evidence_submissions_status_check';
  `))
  .then(res => console.log(res.rows[0].constraint_def))
  .catch(console.error)
  .finally(() => client.end());
