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
