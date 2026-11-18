/**
 * Local Phase 1 server for development and demos — NEVER for production.
 *
 *   npm run dev:phase1      (from backend/)
 *
 * - Starts a local PostgreSQL (embedded-postgres, dev dependency) whose data
 *   persists in backend/.devdata, applies the qiyas schema, seeds a demo
 *   organization and the demo DGA framework on first run.
 * - Serves the real /api/v2 on port 8082 (where the Vite dev server proxies /api),
 *   plus a demo sign-in at /api/v1/auth/* : any demo email logs in, no password.
 * - Runs the deadline scheduler every minute.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import express from 'express';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { Client, Pool } from 'pg';
import { buildContext } from '../core/context';
import { addBusinessDays } from '../domain/calendar';
import { linkEvidence, submitEvidence, uploadEvidence } from '../evidence/evidence';
import { acceptEvidence, claimEvidence } from '../evidence/review';
import { DevScanner, LocalDiskStorage } from '../evidence/storage';
import { activateFramework, createCycle, importFramework, transitionCycle } from '../framework/frameworkService';
import { importCrosswalk } from '../framework/crosswalk';
import { syncLibrary } from '../library/library';
import { migrate } from '../db/migrate';
import { seedRbac } from '../db/seedRbac';
import { createComplianceRouter } from '../api/router';
import { createPublicRouter, runComplianceTick } from '../runtime';
import { assignTask, createAssignment, publishAssignment } from '../work/tasks';
import { existsSync as fileExists, readFileSync } from 'fs';

// The official DGA v5.0 framework when available, otherwise the small demo framework.
const OFFICIAL = path.resolve(__dirname, '../framework/data/dga-v5.0.json');
const demoFramework = JSON.parse(readFileSync(fileExists(OFFICIAL) ? OFFICIAL : path.resolve(__dirname, 'demo-framework.json'), 'utf8'));
const official = fileExists(OFFICIAL);
// Last year's framework and its crosswalk, for the carry-over demo
const V4 = path.resolve(__dirname, '../framework/data/dga-v4.0.json');
const CROSSWALK = path.resolve(__dirname, '../framework/data/crosswalk-v4.0-v5.0.json');

const ROOT = path.resolve(__dirname, '../../../.devdata');
const PG_PORT = Number(process.env.QIYAS_DEV_PG_PORT || 54330);
const API_PORT = Number(process.env.QIYAS_DEV_API_PORT || 8082);
const SECRET = 'qiyas-dev-only-secret';

export const DEMO_USERS = [
  { key: 'tariq', email: 'admin@demo.qiyas', ar: 'طارق السالم', en: 'Tariq Alsalem' },
  { key: 'alaa', email: 'alaa@demo.qiyas', ar: 'علاء العنزي', en: 'Alaa Alanazi' },
  { key: 'ahmad', email: 'ahmad@demo.qiyas', ar: 'أحمد الشمري', en: 'Ahmad Alshammari' },
  { key: 'yousef', email: 'yousef@demo.qiyas', ar: 'يوسف الحربي', en: 'Yousef Alharbi' },
  { key: 'jan', email: 'jan@demo.qiyas', ar: 'جان المطيري', en: 'Jan Almutairi' },
  { key: 'mona', email: 'mona@demo.qiyas', ar: 'منى القحطاني', en: 'Mona Alqahtani' },
  { key: 'ali', email: 'ali@demo.qiyas', ar: 'علي الدوسري', en: 'Ali Aldosari' },
  { key: 'sara', email: 'sara@demo.qiyas', ar: 'سارة العتيبي', en: 'Sara Alotaibi' },
  { key: 'khalid', email: 'khalid@demo.qiyas', ar: 'خالد الرويلي', en: 'Khalid Alruwaili' },
  { key: 'huda', email: 'huda@demo.qiyas', ar: 'هدى السبيعي', en: 'Huda Alsubaie' },
  { key: 'nasser', email: 'ceo@demo.qiyas', ar: 'ناصر الغامدي', en: 'Nasser Alghamdi' },
] as const;

const sign = (userId: string) => `${userId}.${createHmac('sha256', SECRET).update(userId).digest('hex')}`;
function verify(token: string | undefined): string | null {
  if (!token) return null;
  const [userId, sig] = token.split('.');
  if (!userId || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(userId).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

async function startPostgres(): Promise<string> {
  // embedded-postgres is an ES module; load it with a real dynamic import.
  const { default: EmbeddedPostgres } = await (new Function('m', 'return import(m)') as (m: string) => Promise<any>)('embedded-postgres');
  const dataDir = path.join(ROOT, 'pg');
  const fresh = !existsSync(dataDir);
  mkdirSync(ROOT, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'qiyas-dev', port: PG_PORT, persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => undefined,
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('qiyas_dev');
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return `postgres://postgres:qiyas-dev@127.0.0.1:${PG_PORT}/qiyas_dev`;
}

async function seedDemo(db: Client): Promise<void> {
  const seeded = await db.query('SELECT 1 FROM qiyas.departments LIMIT 1');
  if (seeded.rows.length) return;
  console.log('Seeding the demo organization…');
  await db.query('BEGIN');
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    ids[u.key] = (await db.query('INSERT INTO public.users (email, name, name_ar) VALUES ($1, $2, $3) RETURNING id', [u.email, u.en, u.ar])).rows[0].id;
  }
  await db.query(`INSERT INTO qiyas.org_settings (name_ar, name_en) VALUES ('جهة تجريبية', 'Demo Government Entity')`);
  const dept = async (code: string, ar: string, en: string) =>
    (await db.query('INSERT INTO qiyas.departments (code, name_ar, name_en) VALUES ($1, $2, $3) RETURNING id', [code, ar, en])).rows[0].id as string;
  const it = await dept('IT', 'إدارة تقنية المعلومات', 'Information Technology');
  const hr = await dept('HR', 'إدارة الموارد البشرية', 'Human Resources');
  const member = (d: string, u: string, m: string) => db.query('INSERT INTO qiyas.department_members (department_id, user_id, membership) VALUES ($1, $2, $3)', [d, ids[u], m]);
  await member(it, 'mona', 'manager'); await member(it, 'ali', 'member'); await member(it, 'sara', 'member');
  await member(hr, 'khalid', 'manager'); await member(hr, 'huda', 'member');
  const grant = (u: string, role: string, d: string | null = null) =>
    db.query('INSERT INTO qiyas.role_grants (role_id, user_id, department_id) SELECT id, $2, $3 FROM qiyas.roles WHERE code = $1', [role, ids[u], d]);
  await grant('tariq', 'ADM'); await grant('alaa', 'QC'); await grant('ahmad', 'QC'); await grant('yousef', 'DSO'); await grant('jan', 'DSO');
  await grant('nasser', 'EXE'); await grant('mona', 'DM', it); await grant('ali', 'EMP', it); await grant('sara', 'EMP', it);
  await grant('khalid', 'DM', hr); await grant('huda', 'EMP', hr);
  await db.query(`INSERT INTO qiyas.group_members (group_id, user_id) SELECT id, $1 FROM qiyas.groups WHERE code = 'compliance_oversight'`, [ids.nasser]);
  await db.query('COMMIT');

  // Framework, cycle and some work in different states, through the real services.
  const now = new Date();
  const run = async (user: string, fn: (ctx: Awaited<ReturnType<typeof buildContext>>) => Promise<unknown>) => {
    await db.query('BEGIN');
    try {
      const out = await fn(await buildContext(db, ids[user], now));
      await db.query('COMMIT');
      return out as any;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  };
  const year = now.getFullYear();
  const evidence = { storage: new LocalDiskStorage(path.join(ROOT, 'evidence')), scanner: new DevScanner() };
  const withV4 = official && fileExists(V4) && fileExists(CROSSWALK);
  if (withV4) {
    // Last year's cycle on v4.0, closed, with some accepted evidence to carry over
    const v4 = await run('alaa', (c) => importFramework(c, JSON.parse(readFileSync(V4, 'utf8'))));
    await run('alaa', (c) => activateFramework(c, v4.frameworkVersionId));
    const prev = await run('alaa', (c) => createCycle(c, { frameworkVersionId: v4.frameworkVersionId, year: year - 1, name: `Qiyas ${year - 1} / v4.0`, startsOn: `${year - 1}-01-01`, endsOn: `${year - 1}-12-31` }));
    await run('alaa', (c) => transitionCycle(c, prev.cycleId, 'open'));
    const lastYear: Array<[string, string, string, string, string, string]> = [
      ['5.1.1-R1', it, 'mona', 'ali', 'Digital transformation strategy 2025', 'dt-strategy-2025.pdf'],
      ['5.8.4-R1', it, 'mona', 'sara', 'Risk management training needs report', 'risk-training-needs.pdf'],
      ['5.6.1-R1', hr, 'khalid', 'huda', 'Digital capability gap study', 'capability-gap-study.pdf'],
      ['5.19.1-R1', it, 'mona', 'ali', 'Data governance framework', 'data-governance-framework.pdf'],
    ];
    for (const [code, dept, manager, employee, title, filename] of lastYear) {
      const cr = (await db.query(`SELECT cr.id FROM qiyas.cycle_requirements cr JOIN qiyas.requirements r ON r.id = cr.requirement_id WHERE cr.cycle_id = $1 AND r.code = $2`, [prev.cycleId, code])).rows[0].id;
      const taskId = await run('alaa', async (c) => publishAssignment(c, await createAssignment(c, {
        cycleId: prev.cycleId, departmentId: dept, cycleRequirementIds: [cr], title, implementationDueAt: addBusinessDays(now, 5, c.calendar), managerDueAt: addBusinessDays(now, 2, c.calendar),
      })));
      await run(manager, (c) => assignTask(c, taskId, ids[employee]));
      const v = await run(employee, (c) => uploadEvidence(c, evidence, { taskId, title, file: { content: Buffer.from(`%PDF demo ${title}`), filename, mimeType: 'application/pdf' } }));
      const linkId = await run(employee, (c) => linkEvidence(c, v.versionId, { taskId, cycleRequirementId: cr }));
      await run(employee, (c) => submitEvidence(c, taskId));
      await run('ahmad', (c) => claimEvidence(c, linkId));
      await run('ahmad', (c) => acceptEvidence(c, linkId, 'Approved'));
    }
    await run('alaa', (c) => transitionCycle(c, prev.cycleId, 'close', 'Submitted to DGA'));
  }
  const { frameworkVersionId } = await run('alaa', (c) => importFramework(c, demoFramework));
  await run('alaa', (c) => activateFramework(c, frameworkVersionId));
  if (withV4) await run('alaa', (c) => importCrosswalk(c, JSON.parse(readFileSync(CROSSWALK, 'utf8'))));
  const { cycleId } = await run('alaa', (c) => createCycle(c, { frameworkVersionId, year, name: official ? `Qiyas ${year} / v5.0` : `Qiyas ${year} / v5.0 (demo)`, startsOn: `${year}-01-01`, endsOn: `${year}-12-31` }));
  // Requirement codes used by the sample tasks, in the official or the demo framework
  const C = official
    ? { plan: '5.1.1-R1', exec: '5.1.2-R1', ea: '5.3.1-R1', hr: '5.6.1-R1' }
    : { plan: '1.1.1-R1', exec: '1.1.2-R1', ea: '1.2.1-R1', hr: '2.1.1-R1' };
  await run('alaa', (c) => transitionCycle(c, cycleId, 'open'));
  const reqs = (await db.query(`SELECT cr.id, r.code FROM qiyas.cycle_requirements cr JOIN qiyas.requirements r ON r.id = cr.requirement_id WHERE cr.cycle_id = $1 ORDER BY r.code`, [cycleId])).rows;
  const req = (code: string) => reqs.find((r) => r.code === code)!.id as string;
  const proof = async (code: string) => (await db.query(`SELECT rp.proof_item_id FROM qiyas.requirement_proof_items rp
     JOIN qiyas.cycle_requirements cr ON cr.requirement_id = rp.requirement_id
     JOIN qiyas.requirements r ON r.id = rp.requirement_id WHERE r.code = $1 AND cr.cycle_id = $2 LIMIT 1`, [code, cycleId])).rows[0]?.proof_item_id as string | undefined;
  const assign = async (dept: string, codes: string[], title: string, days: number) =>
    run('alaa', async (c) => publishAssignment(c, await createAssignment(c, {
      cycleId, departmentId: dept, cycleRequirementIds: codes.map(req), title, instructions: 'Upload the approved, signed version dated within this cycle.',
      implementationDueAt: addBusinessDays(now, days, c.calendar), managerDueAt: addBusinessDays(now, Math.min(2, days), c.calendar),
    })));
  await assign(it, [C.plan], 'Digital transformation strategic plan', 10);                 // waiting for Mona to assign
  const t2 = await assign(it, [C.exec], 'Digital transformation execution plan', 6);
  await run('mona', (c) => assignTask(c, t2, ids.ali));                                         // Ali working on it
  const t3 = await assign(it, [C.ea], 'Enterprise architecture', 8);
  await run('mona', (c) => assignTask(c, t3, ids.sara));
  const up = await run('sara', (c) => uploadEvidence(c, evidence, { taskId: t3, title: 'Enterprise architecture unit charter', file: { content: Buffer.from('%PDF demo EA charter'), filename: 'ea-unit-charter.pdf', mimeType: 'application/pdf' } }));
  const p3 = await proof(C.ea);
  await run('sara', (c) => linkEvidence(c, up.versionId, { taskId: t3, cycleRequirementId: req(C.ea), proofItemId: p3 }));
  await run('sara', (c) => submitEvidence(c, t3));                                               // waiting for review
  const t4 = await assign(hr, [C.hr], 'Capability building plan', 5);
  await run('khalid', (c) => assignTask(c, t4, ids.huda));
  const up4 = await run('huda', (c) => uploadEvidence(c, evidence, { taskId: t4, title: 'Digital capability building plan', file: { content: Buffer.from('%PDF demo capability plan'), filename: 'capability-plan.pdf', mimeType: 'application/pdf' } }));
  const p4 = await proof(C.hr);
  const link4 = await run('huda', (c) => linkEvidence(c, up4.versionId, { taskId: t4, cycleRequirementId: req(C.hr), proofItemId: p4 }));
  await run('huda', (c) => submitEvidence(c, t4));
  await run('ahmad', (c) => claimEvidence(c, link4));
  await run('ahmad', (c) => acceptEvidence(c, link4, 'Approved and dated in cycle'));             // accepted, not yet posted
  console.log('Demo data ready.');
}

async function main() {
  const url = await startPostgres();
  const setup = new Client({ connectionString: url });
  await setup.connect();
  await setup.query(`CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, name_ar TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMPTZ)`); // C17: the account state columns of the real table
  await migrate(setup);
  await seedRbac(setup);
  await seedDemo(setup);
  await setup.query('BEGIN');
  console.log('Regulations library:', await syncLibrary(setup));
  await setup.query('COMMIT');
  await setup.end();

  const pool = new Pool({ connectionString: url, max: 10 });
  const poolLike = { connect: () => pool.connect() };
  const app = express();
  app.use(express.json());

  // Demo sign-in: same shape as the real /api/v1/auth endpoints the login screen uses.
  const userFor = async (id: string) => {
    const u = (await pool.query('SELECT id, email, name, name_ar FROM public.users WHERE id = $1', [id])).rows[0];
    const g = (await pool.query(`SELECT r.code FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id WHERE g.user_id = $1 AND g.revoked_at IS NULL ORDER BY r.code`, [id])).rows;
    return u && { id: u.id, email: u.email, full_name: u.name_ar ?? u.name, full_name_en: u.name, role: (g[0]?.code ?? 'EMP').toLowerCase(), roles: g.map((r) => r.code) };
  };
  app.post('/api/v1/auth/login', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const row = (await pool.query('SELECT id FROM public.users WHERE lower(email) = $1', [email])).rows[0];
    if (!row) {
      res.status(401).json({ success: false, message: `Unknown demo user. Try: ${DEMO_USERS.map((u) => u.email).join(', ')}` });
      return;
    }
    res.json({ success: true, data: { accessToken: sign(row.id), user: await userFor(row.id) } });
  });
  const authenticate: express.RequestHandler = (req, _res, next) => {
    const id = verify(req.header('authorization')?.replace(/^Bearer /, ''));
    if (id) (req as any).user = { id };
    next();
  };
  app.get('/api/v1/auth/me', authenticate, async (req, res) => {
    const id = (req as any).user?.id;
    const user = id && (await userFor(id));
    if (!user) res.status(401).json({ success: false, message: 'Not signed in' });
    else res.json({ success: true, data: { user } });
  });
  app.post('/api/v1/auth/logout', (_req, res) => res.json({ success: true, data: {} }));
  const evidenceDeps = { storage: new LocalDiskStorage(path.join(ROOT, 'evidence')), scanner: new DevScanner() };
  app.use('/api/v2/public', createPublicRouter(poolLike, evidenceDeps));
  app.use('/api/v2', createComplianceRouter({ pool: poolLike, authenticate, evidence: evidenceDeps }));

  app.listen(API_PORT, '127.0.0.1', () => {
    console.log(`Qiyas Phase 1 dev server on http://127.0.0.1:${API_PORT} (PostgreSQL on ${PG_PORT})`);
    console.log(`Demo sign-in: ${DEMO_USERS.map((u) => u.email).join(', ')}`);
  });
  const tick = () => runComplianceTick(poolLike, null).catch((e) => console.error('scheduler', e));
  void tick();
  setInterval(tick, 60_000).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
