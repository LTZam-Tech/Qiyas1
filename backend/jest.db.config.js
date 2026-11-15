/** Database tests: real PostgreSQL via embedded-postgres. Run with `npm run test:db`. */
const base = require('./jest.config');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: ['**/__dbtests__/**/*.dbtest.ts'],
  globalSetup: '<rootDir>/test/db-global-setup.mjs',
  globalTeardown: '<rootDir>/test/db-global-teardown.mjs',
  testTimeout: 60000,
  maxWorkers: 1,
};
