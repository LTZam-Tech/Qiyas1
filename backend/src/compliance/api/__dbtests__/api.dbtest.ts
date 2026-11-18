/**
 * End-to-end over HTTP: the Phase 1 journey through /api/v2, as the real
 * people, against real PostgreSQL. Steps share state and run in order.
 */
import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { DevScanner, InMemoryStorage } from '../../evidence/storage';
import { runComplianceTick } from '../../runtime';
import { World, at, buildWorld } from '../../work/__dbtests__/world';
import { createComplianceRouter, mountFrameworkUploadParser } from '../router';

let pool: Pool;
let w: World;
let app: express.Express;
let now = at(2026, 11, 15, 9);
const state: Record<string, string> = {};

beforeAll(async () => {
  const setup = await connectTestDb();
  await resetSchema(setup);
  await setup.query('BEGIN');
  w = await buildWorld(setup);
  await setup.query('COMMIT');
  await setup.end();

  pool = new Pool({ connectionString: process.env.QIYAS_TEST_DATABASE_URL, max: 4 });
  app = express();
  // the router has no JSON parser of its own; mount the same parsers as app.ts
  mountFrameworkUploadParser(app);
  app.use(express.json());
  app.use('/api/v2', createComplianceRouter({
    pool: { connect: () => pool.connect() },
    authenticate: (req, _res, next) => {
      const u = req.header('x-test-user');
      if (u) (req as any).user = { id: u };
      next();
    },
    evidence: { storage: new InMemoryStorage(), scanner: new DevScanner() },
    clock: () => now,
  }));
});
afterAll(async () => pool?.end());

const as = (user: keyof World['users']) => ({
  get: (url: string) => request(app).get(`/api/v2${url}`).set('x-test-user', w.users[user]),
  post: (url: string, body: object = {}) => request(app).post(`/api/v2${url}`).set('x-test-user', w.users[user]).send(body),
  put: (url: string, body: object = {}) => request(app).put(`/api/v2${url}`).set('x-test-user', w.users[user]).send(body),
  upload: (url: string) => request(app).post(`/api/v2${url}`).set('x-test-user', w.users[user]),
});

describe('/api/v2 journey', () => {
  it('requires a signed-in user', async () => {
    const res = await request(app).get('/api/v2/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('GET /me returns roles, departments and language', async () => {
    const res = await as('ali').get('/me');
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toEqual([{ role: 'EMP', departmentId: w.depts.it }]);
    expect(res.body.data.language).toBe('ar');
    expect(res.body.data.permissions['task.view']).toEqual(['own']);
  });

  it('the consultant assigns to IT; the manager sees it, the employee does not yet', async () => {
    const created = await as('alaa').post('/assignments', {
      cycleId: w.cycleId, departmentId: w.depts.it, cycleRequirementIds: [w.requirementId], title: 'Strategic plan 5.1.1',
      implementationDueAt: at(2026, 11, 22, 20).toISOString(), managerDueAt: at(2026, 11, 17, 20).toISOString(),
    });
    expect(created.status).toBe(201);
    const pub = await as('alaa').post(`/assignments/${created.body.data.assignmentId}/publish`);
    state.task = pub.body.data.taskId;
    expect((await as('mona').get('/tasks')).body.data.map((t: any) => t.id)).toEqual([state.task]);
    expect((await as('ali').get(`/tasks/${state.task}`)).status).toBe(404);
    expect((await as('mona').post('/assignments', {})).status).toBe(422);
  });

  it('the manager assigns Ali; Ali sees the live deadline and what he can do', async () => {
    const res = await as('mona').post(`/tasks/${state.task}/assign`, { assigneeId: w.users.ali });
    expect(res.body.data).toEqual({ ownerId: w.users.ali, status: 'assigned' });
    const detail = (await as('ali').get(`/tasks/${state.task}`)).body.data;
    expect(detail.deadline.isOverdue).toBe(false);
    expect(detail.can).toMatchObject({ start: true, askClarification: true, askForMoreTime: true, requestExtension: false, escalate: false });
    expect(detail.requirements[0].proof_items).toHaveLength(1);
    expect(detail.requirements[0].conditions).toHaveLength(4);
    expect((await as('sara').get(`/tasks/${state.task}`)).status).toBe(404); // same department, not hers
  });

  it('clarification: Ali asks, the manager sees it in his inbox and answers (D4)', async () => {
    const asked = await as('ali').post(`/tasks/${state.task}/clarifications`, { question: 'Is the 2024 plan acceptable?' });
    expect(asked.status).toBe(201);
    const inbox = (await as('mona').get('/inbox')).body.data;
    expect(inbox.clarifications.map((c: any) => c.id)).toEqual([asked.body.data.clarificationId]);
    const ans = await as('mona').post(`/clarifications/${asked.body.data.clarificationId}/answer`, { body: 'Only if approved after 2023.' });
    expect(ans.body.data.answeredAs).toBe('DM');
  });

  it('upload with an Arabic file name, download it back; another department is refused', async () => {
    const up = await as('ali').upload(`/tasks/${state.task}/evidence`).field('title', 'الخطة الاستراتيجية').attach('file', Buffer.from('%PDF approved plan'), 'الخطة.pdf');
    expect(up.status).toBe(201);
    state.version = up.body.data.versionId;
    state.artifact = up.body.data.artifactId;
    const dl = await as('ali').get(`/evidence-versions/${state.version}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain(encodeURIComponent('الخطة.pdf'));
    expect(Buffer.from(dl.body).toString()).toBe('%PDF approved plan');
    expect((await as('huda').get(`/evidence-versions/${state.version}/download`)).status).toBe(403);
    const bad = await as('ali').upload(`/tasks/${state.task}/evidence`).field('title', 'x').attach('file', Buffer.from('MZ'), 'tool.exe');
    expect([bad.status, bad.body.error.code]).toEqual([422, 'validation']);
  });

  it('link and submit; only consultants see the review queue', async () => {
    const proof = (await as('ali').get(`/tasks/${state.task}`)).body.data.requirements[0].proof_items[0].id;
    const link = await as('ali').post(`/evidence-versions/${state.version}/links`, { taskId: state.task, cycleRequirementId: w.requirementId, proofItemId: proof });
    expect(link.status).toBe(201);
    state.link = link.body.data.linkId;
    state.proof = proof;
    expect((await as('ali').post(`/tasks/${state.task}/submit`)).body.data.submitted).toBe(1);
    expect((await as('ali').get('/review-queue')).status).toBe(403);
    const queue = (await as('ahmad').get('/review-queue')).body.data;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: state.link, can_review: true, standard_code: '5.1.1' });
  });

  it('a short rejection is refused (422); a proper one returns the task to the manager', async () => {
    expect((await as('ahmad').post(`/evidence-links/${state.link}/claim`)).status).toBe(200);
    const short = await as('ahmad').post(`/evidence-links/${state.link}/reject`, { comment: 'unsigned' });
    expect([short.status, short.body.error.code]).toEqual([422, 'validation']);
    expect((await as('ahmad').post(`/evidence-links/${state.link}/reject`, { comment: 'The plan is not signed by the governor' })).status).toBe(200);
    const detail = (await as('mona').get(`/tasks/${state.task}`)).body.data;
    expect([detail.execution_status, detail.current_owner_id]).toEqual(['rework_required', w.users.mona]);
  });

  it('the manager reworks it himself; Ahmad accepts; readiness reaches 100%', async () => {
    const v2 = await as('mona').upload(`/tasks/${state.task}/evidence`).field('artifactId', state.artifact).attach('file', Buffer.from('%PDF signed plan'), 'plan-signed.pdf');
    expect(v2.body.data.versionNo).toBe(2);
    const l2 = await as('mona').post(`/evidence-versions/${v2.body.data.versionId}/links`, { taskId: state.task, cycleRequirementId: w.requirementId, proofItemId: state.proof });
    state.link2 = l2.body.data.linkId;
    await as('mona').post(`/tasks/${state.task}/submit`);
    await as('ahmad').post(`/evidence-links/${state.link2}/claim`);
    expect((await as('ahmad').post(`/evidence-links/${state.link2}/accept`, { comment: 'Signed and in date' })).status).toBe(200);
    const readiness = (await as('mona').get(`/cycles/${w.cycleId}/readiness`)).body.data;
    expect(readiness.cycle.readinessPct).toBe(100);
    expect(readiness.perspectives[0].axes[0].standards[0].requirements[0].readiness).toBe('ready');
    expect((await as('ali').get(`/tasks/${state.task}`)).body.data.execution_status).toBe('completed');
  });

  it('only the submission officer posts to DGA', async () => {
    const queue = (await as('yousef').get(`/cycles/${w.cycleId}/submission-queue?status=not_posted`)).body.data;
    expect(queue.map((l: any) => l.id)).toEqual([state.link2]);
    expect((await as('alaa').post('/submission/post', { linkIds: [state.link2] })).status).toBe(403);
    expect((await as('yousef').post('/submission/post', { linkIds: [state.link2], dgaReference: 'QIYAS-0042' })).body.data.posted).toBe(1);
    expect((await as('yousef').get(`/cycles/${w.cycleId}/readiness`)).body.data.cycle.postingPct).toBe(100);
  });

  it('notifications are produced by the scheduler and read in any language', async () => {
    await runComplianceTick({ connect: () => pool.connect() }, null, now);
    const list = (await as('ali').get('/notifications')).body.data;
    const assigned = list.find((n: any) => n.event_code === 'task.assigned');
    expect(assigned.text.en.title).toBe('A task was assigned to you: Strategic plan 5.1.1');
    expect(assigned.text.ur.title).toContain('آپ کو ایک کام');
    expect((await as('ali').get('/me')).body.data.unreadNotifications).toBeGreaterThan(0);
    await as('ali').post('/notifications/read', { ids: 'all' });
    expect((await as('ali').get('/me')).body.data.unreadNotifications).toBe(0);
    await as('ali').put('/me/language', { language: 'ur' });
    expect((await as('ali').get('/me')).body.data.language).toBe('ur');
  });

  it('administration: only the administrator; D3 enforced through the API', async () => {
    expect((await as('alaa').get('/admin/users')).status).toBe(403);
    expect((await as('tariq').get('/admin/users')).status).toBe(200);
    const sod = await as('tariq').post('/admin/role-grants', { userId: w.users.alaa, role: 'DSO' });
    expect([sod.status, sod.body.error.message]).toEqual([422, 'Qiyas Consultant and DGA Submission Officer cannot be held by the same person']);
    const dept = await as('tariq').post('/admin/departments', { code: 'FIN', nameAr: 'المالية', nameEn: 'Finance' });
    expect(dept.status).toBe(201);
    expect((await as('tariq').put(`/admin/departments/${dept.body.data.departmentId}/manager`, { userId: w.users.sara })).status).toBe(200);
    const members = (await as('sara').get(`/departments/${dept.body.data.departmentId}/members`)).body.data;
    expect(members).toEqual([expect.objectContaining({ id: w.users.sara, membership: 'manager' })]);
  });

  it('bad ids are a validation error, not a crash', async () => {
    const res = await as('ali').get('/tasks/not-a-uuid');
    expect(res.status).toBe(422);
    expect(res.body.error.issues).toBeDefined();
  });
});
