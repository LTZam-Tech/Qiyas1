/**
 * Shared world for the legacy v1 database tests (security remediation B2, design G1).
 *
 * - Uses its own database, qiyas_v1_test, on the embedded PostgreSQL that test/db-global-setup.mjs
 *   starts: the compliance resetSchema() creates a minimal public.users that conflicts with the
 *   legacy table, so the two never share a database.
 * - Sets every setting the app reads, and stubs dotenv, BEFORE importing the app, so a developer's
 *   backend/.env is never read.
 * - chdir()s into a temporary folder, because the v1 storage and upload paths come from the working
 *   directory. The legacy migration runner then falls back to backend/db/migrations.
 * - Runs the real legacy migration runner, then the Phase 1 (v2) migrations and role matrix.
 * - Seeds admin, dean, consultant, employees E1 and E2, a role-less user R, and tasks T1 (E1) and
 *   T2 (E2). Every seeded user has the password PASSWORD.
 * - Drives the full app (src/app.ts) with supertest. Each request gets its own X-Forwarded-For
 *   address so the per-IP rate limiters never interfere with the lockout tests.
 *
 * Call buildV1World() in beforeAll and world.close() in afterAll. Do not import '@/...' modules
 * statically in a test file that uses this world: they must load after the environment is set.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from 'pg';
import request from 'supertest';
import type { Application } from 'express';

export const PASSWORD = 'V1-Test-Pass-123';
export const V1_TEST_DB = 'qiyas_v1_test';

export interface V1World {
  app: Application;
  /** Runs SQL on the test database through the app's own pool. */
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
  users: Record<'admin' | 'dean' | 'consultant' | 'e1' | 'e2' | 'r', { id: string; email: string }>;
  tasks: { t1: string; t2: string };
  /** The temporary working directory the app runs in (its uploads/ folder lives here). */
  cwd: string;
  /** A v1 access token, minted the same way the login endpoint does. */
  token: (user: keyof V1World['users']) => string;
  /** supertest agent bound to the app, with a fresh client address. */
  http: () => request.SuperTest<request.Test>;
  login: (email: string, password: string) => Promise<request.Response>;
  close: () => Promise<void>;
}

let ipCounter = 0;
const nextIp = () => {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};

export async function buildV1World(): Promise<V1World> {
  const url = process.env.QIYAS_TEST_DATABASE_URL;
  if (!url) throw new Error('QIYAS_TEST_DATABASE_URL is not set: run database tests with `npm run test:db`');
  const parsed = new URL(url);

  // A fresh database for this test file.
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${V1_TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${V1_TEST_DB} ENCODING 'UTF8'`);
  await admin.end();

  // Settings, before anything under src/ is loaded.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyas-v1-'));
  const env: Record<string, string> = {
    NODE_ENV: 'test',
    POSTGRES_HOST: parsed.hostname,
    POSTGRES_PORT: parsed.port,
    POSTGRES_DB: V1_TEST_DB,
    POSTGRES_USER: decodeURIComponent(parsed.username),
    POSTGRES_PASSWORD: decodeURIComponent(parsed.password),
    POSTGRES_SSL: 'false',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '1',
    REDIS_PASSWORD: '',
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: '1',
    MINIO_ROOT_USER: 'v1-test-only',
    MINIO_ROOT_PASSWORD: 'v1-test-only-password',
    JWT_ACCESS_SECRET: 'v1-test-only-access-secret-0123456789abcdef',
    JWT_REFRESH_SECRET: 'v1-test-only-refresh-secret-0123456789abcdef',
    JWT_ALGORITHM: 'HS256',
    JWT_ACCESS_PRIVATE_KEY: '',
    JWT_ACCESS_PUBLIC_KEY: '',
    CORS_ORIGIN: 'http://localhost:4200',
    QIYAS_STORAGE: 'disk',
    QIYAS_EVIDENCE_DIR: path.join(cwd, 'evidence-store'),
    QIYAS_CLAMAV_HOST: '',
    QIYAS_LOAD_SHIPPED_DATA: 'off',
    QIYAS_SCHEDULER: 'off',
    SMTP_HOST: '',
    TRUST_PROXY: 'false',
  };
  const previousEnv = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const previousCwd = process.cwd();
  Object.assign(process.env, env);
  jest.doMock('dotenv', () => {
    const stub = { config: () => ({ parsed: {} }) };
    return { __esModule: true, default: stub, ...stub };
  });
  process.chdir(cwd);

  const { default: app } = await import('@/app');
  const { default: db } = await import('@/db');
  const { runPendingMigrations } = await import('@/db/migrations');
  const { migrate } = await import('@/compliance/db/migrate');
  const { seedRbac } = await import('@/compliance/db/seedRbac');
  const { default: authService } = await import('@/modules/auth/auth.service');
  const bcrypt = (await import('bcrypt')).default;

  // Requests carry their own X-Forwarded-For (see nextIp); trust it in tests only.
  app.set('trust proxy', true);

  await runPendingMigrations();
  const client = await db.getClient();
  try {
    await migrate(client);
    await seedRbac(client);
  } finally {
    client.release();
  }

  const query = (text: string, params?: unknown[]) => db.query(text, params as any[]);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const mkUser = async (key: string, role: string | null) => {
    const email = `${key}@v1.test`;
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [key.toUpperCase(), email, hash],
    );
    if (role) await query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`, [rows[0].id, role]);
    return { id: rows[0].id as string, email };
  };
  const users = {
    admin: await mkUser('admin', 'admin'),
    dean: await mkUser('dean', 'dean'),
    consultant: await mkUser('consultant', 'consultant'),
    e1: await mkUser('e1', 'employee'),
    e2: await mkUser('e2', 'employee'),
    r: await mkUser('r', null),
  };

  const one = async (text: string, params: unknown[]) => (await query(text, params)).rows[0].id as string;
  const perspective = await one(`INSERT INTO perspectives (code, name_en, name_ar) VALUES ('P1', 'P1', 'P1') RETURNING id`, []);
  const axis = await one(`INSERT INTO axes (perspective_id, code, name_en, name_ar) VALUES ($1, 'A1', 'A1', 'A1') RETURNING id`, [perspective]);
  const standard = await one(`INSERT INTO standards (axis_id, code, name_en, name_ar) VALUES ($1, 'S1', 'S1', 'S1') RETURNING id`, [axis]);
  const requirement = await one(
    `INSERT INTO evidence_requirements (standard_id, code, title_en, title_ar) VALUES ($1, 'R1', 'R1', 'R1') RETURNING id`, [standard]);
  const mkTask = (assignee: string, title: string) => one(
    `INSERT INTO tasks (evidence_requirement_id, standard_id, assigned_to, assigned_by, title, due_date)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + 30) RETURNING id`,
    [requirement, standard, assignee, users.dean.id, title],
  );
  const tasks = { t1: await mkTask(users.e1.id, 'T1'), t2: await mkTask(users.e2.id, 'T2') };

  const roleOf: Record<keyof typeof users, string> = {
    admin: 'admin', dean: 'dean', consultant: 'consultant', e1: 'employee', e2: 'employee', r: '',
  };
  const http = () => {
    const agent = request(app);
    const ip = nextIp();
    const wrap = (m: 'get' | 'post' | 'put' | 'patch' | 'delete') => (u: string) => agent[m](u).set('X-Forwarded-For', ip);
    return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') } as unknown as request.SuperTest<request.Test>;
  };

  return {
    app,
    query,
    users,
    tasks,
    cwd,
    token: (user) => authService.generateAccessToken(users[user].id, roleOf[user]),
    http,
    login: (email, password) => http().post('/api/v1/auth/login').send({ email, password }),
    close: async () => {
      await db.close();
      // Leave the worker as we found it for the next test file.
      process.chdir(previousCwd);
      for (const [k, v] of Object.entries(previousEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      fs.rmSync(cwd, { recursive: true, force: true });
    },
  };
}
