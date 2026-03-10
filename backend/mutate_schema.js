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
  .then(() => client.query('ALTER TABLE evidence_submissions ADD COLUMN review_comment text;'))
  .then(() => console.log('Column added successfully'))
  .catch(console.error)
  .finally(() => client.end());
