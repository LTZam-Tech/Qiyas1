const { Client } = require('pg');
const { Client: MinioClient } = require('minio');
require('dotenv').config();

const db = new Client({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD
});

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin'
});

async function run() {
  await db.connect();
  try {
    const fileId = '6b103750-e73f-441a-b61c-a912a55b1f93';
    const subId = '37534195-7cf3-411e-aa8d-1f0dd5560e38';
    
    console.log(`Checking file ${fileId} for submission ${subId}`);
    const res = await db.query('SELECT * FROM evidence_files WHERE id = $1 AND submission_id = $2', [fileId, subId]);
    
    if (res.rows.length === 0) {
      console.log('File not found in DB!');
      return;
    }
    
    const file = res.rows[0];
    console.log('File found:', file);
    
    const storagePath = file.storage_path || file.stored_filename;
    console.log('Storage path:', storagePath);
    
    try {
      const url = await minioClient.presignedGetObject('evidence', storagePath, 900);
      console.log('Generated URL:', url);
    } catch (e) {
      console.error('MinIO Error:', e);
    }
  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await db.end();
  }
}

run();
