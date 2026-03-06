console.log('Test 1: Starting manual DB test');

try {
  console.log('Test 2: Importing config');
  const config = require('./dist/config').default;
  console.log('Test 3: Config loaded, port =', config.port);
  
  console.log('Test 4: Importing pg');
  const { Pool } = require('pg');
  console.log('Test 5: pg imported');
  
  console.log('Test 6: Creating pool...');
  const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    min: 2,
    max: 10,
  });
  console.log('Test 7: Pool created');
  
  pool.query('SELECT 1').then(() => {
    console.log('Test 8: Query successful!');
    pool.end();
    process.exit(0);
  }).catch((err) => {
    console.error('Test ERROR:', err.message);
    pool.end();
    process.exit(1);
  });
  
} catch (error) {
  console.error('SYNC ERROR:', error);
  process.exit(1);
}
