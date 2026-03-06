console.log('Starting simple test...');

// Test basic require
try {
  console.log('Testing require of dist/config...');
  const config = require('./dist/config');
  console.log('Config loaded:', config.default.port);
} catch (error) {
  console.error('Error loading config:', error.message);
}

console.log('Test complete');
