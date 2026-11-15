// Starts a throw-away PostgreSQL for the database tests (npm run test:db).
// Uses embedded-postgres (dev dependency only, never shipped). Data lives in
// the OS temp folder and is deleted on teardown.
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

export default async function setup() {
  const port = await freePort();
  const databaseDir = mkdtempSync(join(tmpdir(), 'qiyas-testdb-'));
  const password = 'qiyas-test-only';
  // UTF-8 is mandatory: Windows would otherwise default to WIN1252, which cannot store Arabic or Urdu.
  const pg = new EmbeddedPostgres({
    databaseDir, user: 'postgres', password, port, persistent: false, onLog: () => {},
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('qiyas_test');
  globalThis.__QIYAS_TEST_PG__ = pg;
  process.env.QIYAS_TEST_DATABASE_URL = `postgres://postgres:${password}@127.0.0.1:${port}/qiyas_test`;
}
