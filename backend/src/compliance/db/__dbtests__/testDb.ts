import { Client } from 'pg';
import { migrate } from '../migrate';
import { seedRbac } from '../seedRbac';

/** Connects to the throw-away test database started by test/db-global-setup.mjs. */
export async function connectTestDb(): Promise<Client> {
  const url = process.env.QIYAS_TEST_DATABASE_URL;
  if (!url) throw new Error('QIYAS_TEST_DATABASE_URL is not set: run database tests with `npm run test:db`');
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * Fresh Phase 1 schema. public.users stands in for the legacy identity table
 * that the real installation already has.
 */
export async function resetSchema(client: Client): Promise<void> {
  await client.query('DROP SCHEMA IF EXISTS qiyas CASCADE');
  await client.query(`CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL)`);
  await client.query('TRUNCATE public.users CASCADE');
  await migrate(client);
  await seedRbac(client);
}

export async function createUser(client: Client, name: string): Promise<string> {
  const { rows } = await client.query('INSERT INTO public.users (email, name) VALUES ($1, $2) RETURNING id', [`${name.toLowerCase()}@test.local`, name]);
  return rows[0].id;
}

export async function roleId(client: Client, code: string): Promise<string> {
  const { rows } = await client.query('SELECT id FROM qiyas.roles WHERE code = $1', [code]);
  return rows[0].id;
}

/** Runs a statement expected to fail and returns the PostgreSQL error message. */
export async function expectDbError(client: Client, text: string, params?: unknown[]): Promise<string> {
  await client.query('SAVEPOINT expect_error');
  try {
    await client.query(text, params);
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT expect_error');
    return (err as Error).message;
  }
  await client.query('RELEASE SAVEPOINT expect_error');
  throw new Error(`Expected the statement to fail: ${text}`);
}

// ------------------------------------------------------------------ two-connection race tests (B5)

/** Backend process id of a connection, for pg_blocking_pids. */
export async function backendPid(client: Client): Promise<number> {
  return (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
}

/** Polls (up to ~5 s) until the backend `pid` waits on a lock held by another session; throws otherwise. */
export async function waitUntilBlocked(observer: Client, pid: number): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const { rows } = await observer.query('SELECT cardinality(pg_blocking_pids($1)) AS n', [pid]);
    if (rows[0].n > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`backend ${pid} never blocked: the operation is not serialized`);
}

/** Watches a promise without awaiting it, so its state can be asserted while it is still running. */
export function track(p: Promise<unknown>) {
  const t: { state: 'pending' | 'resolved' | 'rejected'; error: unknown; done: Promise<void> } = { state: 'pending', error: undefined, done: Promise.resolve() };
  t.done = p.then(() => { t.state = 'resolved'; }, (e) => { t.state = 'rejected'; t.error = e; });
  return t;
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
