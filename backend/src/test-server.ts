console.log('1. Starting test server');

try {
  console.log('2. Importing config...');
  import('@/config').then(() => {
    console.log('3. Config imported');
    
    console.log('4. Importing logger...');
    return import('@/utils/logger');
  }).then(() => {
    console.log('5. Logger imported');
    
    console.log('6. Importing db...');
    return import('@/db');
  }).then(() => {
    console.log('7. DB imported');
    
    console.log('8. Importing redis...');
    return import('@/db/redis');
  }).then(() => {
    console.log('9. Redis imported');
    
    console.log('10. Importing app...');
    return import('./app');
  }).then(() => {
    console.log('11. App imported - SUCCESS!');
    process.exit(0);
  }).catch((error) => {
    console.error('ERROR during import:', error);
    process.exit(1);
  });
} catch (error) {
  console.error('SYNC ERROR:', error);
  process.exit(1);
}
