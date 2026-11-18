/**
 * End-to-end over HTTP: the Phase 1 journey through /api/v2, as the real
 * people, against real PostgreSQL. Steps share state and run in order.
 */
import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { connectTestDb, createUser, resetSchema, roleId } from '../../db/__dbtests__/testDb';
import { DevScanner, InMemoryStorage } from '../../evidence/storage';
import { runComplianceTick } from '../../runtime';
import { World, at, buildWorld } from '../../work/__dbtests__/world';
import { createComplianceRouter } from '../router';

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

// ------------------------------------------------------------------ security remediation B3 (C3, C15)
describe('/api/v2 evidence binding and task detail scopes (C3, C15)', () => {
  const s: Record<string, string> = {};
  let exe: string;
  const asId = (userId: string) => ({
    get: (url: string) => request(app).get(`/api/v2${url}`).set('x-test-user', userId),
  });
  const dueDates = { implementationDueAt: at(2026, 11, 22, 20).toISOString(), managerDueAt: at(2026, 11, 17, 20).toISOString() };
  const newTask = async (dept: 'it' | 'hr', title: string) => {
    const created = await as('alaa').post('/assignments', { cycleId: w.cycleId, departmentId: w.depts[dept], cycleRequirementIds: [w.requirementId], title, ...dueDates });
    return (await as('alaa').post(`/assignments/${created.body.data.assignmentId}/publish`)).body.data.taskId as string;
  };

  beforeAll(async () => {
    // an executive viewer, added to the shared world for these cases
    const c = await connectTestDb();
    exe = await createUser(c, 'Nadia');
    await c.query('INSERT INTO qiyas.role_grants (role_id, user_id, department_id) VALUES ($1, $2, NULL)', [await roleId(c, 'EXE'), exe]);
    await c.end();
  });

  it('setup: Huda works an HR task (upload, clarification, more time, submit); Ali owns an IT task', async () => {
    s.hrTask = await newTask('hr', 'HR policy 5.1.1');
    expect((await as('khalid').post(`/tasks/${s.hrTask}/assign`, { assigneeId: w.users.huda })).status).toBe(200);
    const up = await as('huda').upload(`/tasks/${s.hrTask}/evidence`).field('title', 'HR-CONFIDENTIAL salaries').attach('file', Buffer.from('%PDF DUMMY-HR-CONFIDENTIAL'), 'hr-salaries.pdf');
    expect(up.status).toBe(201);
    s.hrVersion = up.body.data.versionId;
    s.hrArtifact = up.body.data.artifactId;
    // a second HR file that stays unlinked, for the withdrawn-link case (the first is linked to the same requirement)
    const up2 = await as('huda').upload(`/tasks/${s.hrTask}/evidence`).field('title', 'HR roster').attach('file', Buffer.from('%PDF DUMMY-HR-ROSTER'), 'hr-roster.pdf');
    expect(up2.status).toBe(201);
    s.hrVersion2 = up2.body.data.versionId;
    expect((await as('huda').post(`/tasks/${s.hrTask}/clarifications`, { question: 'Which salary scale applies?' })).status).toBe(201);
    expect((await as('huda').post(`/tasks/${s.hrTask}/more-time`, { requestedDueAt: at(2026, 11, 30, 20).toISOString(), justification: 'Waiting for payroll' })).status).toBe(201);
    const l = await as('huda').post(`/evidence-versions/${s.hrVersion}/links`, { taskId: s.hrTask, cycleRequirementId: w.requirementId });
    expect(l.status).toBe(201);
    s.hrLink = l.body.data.linkId;
    expect((await as('huda').post(`/tasks/${s.hrTask}/submit`)).status).toBe(200);
    expect((await as('alaa').post(`/tasks/${s.hrTask}/escalate`, { reason: 'Confidential escalation reason' })).status).toBe(200);

    s.itTask = await newTask('it', 'IT plan 5.1.1');
    expect((await as('mona').post(`/tasks/${s.itTask}/assign`, { assigneeId: w.users.ali })).status).toBe(200);
  });

  // ---- C3
  it('C3: POST /evidence-versions/:id/links from another department returns 403', async () => {
    const res = await as('ali').post(`/evidence-versions/${s.hrVersion}/links`, { taskId: s.itTask, cycleRequirementId: w.requirementId });
    expect(res.status).toBe(403);
    expect((await as('ali').get(`/evidence-versions/${s.hrVersion}/download`)).status).toBe(403);
  });

  it('C3: POST /tasks/:id/evidence with a foreign artifactId is refused and adds no version', async () => {
    const res = await as('ali').upload(`/tasks/${s.itTask}/evidence`).field('artifactId', s.hrArtifact).attach('file', Buffer.from('%PDF replaced'), 'replaced.pdf');
    expect([403, 404]).toContain(res.status);
    const v = await as('khalid').get(`/tasks/${s.hrTask}`);
    expect(v.body.data.evidence.map((e: any) => e.version_no)).toEqual([1]);
  });

  it('C3: a withdrawn link no longer grants download', async () => {
    const l = await as('alaa').post(`/evidence-versions/${s.hrVersion2}/links`, { taskId: s.itTask, cycleRequirementId: w.requirementId });
    expect(l.status).toBe(201); // positive control: a consultant links any department's version
    expect((await as('ali').get(`/evidence-versions/${s.hrVersion2}/download`)).status).toBe(200);
    expect((await as('ali').post(`/evidence-links/${l.body.data.linkId}/withdraw`)).status).toBe(200);
    expect((await as('ali').get(`/evidence-versions/${s.hrVersion2}/download`)).status).toBe(403);
  });

  // ---- C15
  it('C15: the submission officer\'s task detail shows no unaccepted evidence and no clarifications', async () => {
    const res = await as('yousef').get(`/tasks/${s.hrTask}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.evidence).toEqual([]);
    expect(d.clarifications).toEqual([]);
    expect(d.extensions).toEqual([]);
    expect(d.escalations).toEqual([]);
    expect(d.history.filter((h: any) => h.reason_kind === 'escalation').map((h: any) => h.note)).toEqual([null]);
    expect(JSON.stringify(d)).not.toContain('HR-CONFIDENTIAL');
    expect(JSON.stringify(d)).not.toContain('Which salary scale');
    expect(d.visibility).toMatchObject({ evidence: 'accepted_only', clarifications: false, escalations: false });
    expect((await as('yousef').get(`/evidence-versions/${s.hrVersion}/download`)).status).toBe(403);
  });

  it('C15: an executive viewer sees only accepted evidence and escalations, never clarifications', async () => {
    const d = (await asId(exe).get(`/tasks/${s.hrTask}`)).body.data;
    expect(d.evidence).toEqual([]);
    expect(d.clarifications).toEqual([]);
    expect(d.extensions).toEqual([]);
    expect(d.escalations.map((e: any) => e.reason)).toEqual(['Confidential escalation reason']);
    expect(d.history.filter((h: any) => h.reason_kind === 'escalation').map((h: any) => h.note)).toEqual(['Confidential escalation reason']);
  });

  it('C15 positive control: the owner (manager) and the original assignee still see draft evidence and clarifications', async () => {
    const mgr = (await as('khalid').get(`/tasks/${s.hrTask}`)).body.data;
    expect(mgr.current_owner_id).toBe(w.users.khalid);
    expect(mgr.evidence).toHaveLength(1);
    expect(mgr.clarifications).toHaveLength(1);
    expect(mgr.clarifications[0].messages.length).toBeGreaterThan(0);
    expect(mgr.extensions).toHaveLength(1);
    const emp = (await as('huda').get(`/tasks/${s.hrTask}`)).body.data;
    expect(emp.evidence).toHaveLength(1);
    expect(emp.clarifications).toHaveLength(1);
    expect(emp.extensions).toHaveLength(1);
  });

  it('C15 positive control: once accepted, the officer sees that evidence in task detail', async () => {
    expect((await as('ahmad').post(`/evidence-links/${s.hrLink}/claim`)).status).toBe(200);
    expect((await as('ahmad').post(`/evidence-links/${s.hrLink}/accept`, { comment: 'ok' })).status).toBe(200);
    const d = (await as('yousef').get(`/tasks/${s.hrTask}`)).body.data;
    expect(d.evidence.map((e: any) => e.id)).toEqual([s.hrLink]);
    expect(d.clarifications).toEqual([]);
    expect((await as('yousef').get(`/evidence-versions/${s.hrVersion}/download`)).status).toBe(200);
  });
});

// ------------------------------------------------------------------ security remediation B4
// Runs last: it closes the shared cycle and reopens it at the end.
describe('/api/v2 closed cycle is read-only (C5)', () => {
  const s: Record<string, string> = {};
  const dueDates = { implementationDueAt: at(2026, 11, 22, 20).toISOString(), managerDueAt: at(2026, 11, 17, 20).toISOString() };

  it('setup: Ali owns an assigned IT task; the posted link of the journey is in the cycle', async () => {
    const created = await as('alaa').post('/assignments', { cycleId: w.cycleId, departmentId: w.depts.it, cycleRequirementIds: [w.requirementId], title: 'IT plan C5', ...dueDates });
    s.task = (await as('alaa').post(`/assignments/${created.body.data.assignmentId}/publish`)).body.data.taskId;
    expect((await as('mona').post(`/tasks/${s.task}/assign`, { assigneeId: w.users.ali })).status).toBe(200);
    const d = (await as('ali').get(`/tasks/${s.task}`)).body.data;
    expect(d.can).toMatchObject({ cycleOpen: true, workEvidence: true, start: true }); // positive control before closing
    expect((await as('alaa').post(`/cycles/${w.cycleId}/transition`, { event: 'close', reason: 'Submitted to DGA' })).status).toBe(200);
  });

  it('C5: unposting on a closed cycle returns 409 and the link stays posted', async () => {
    const res = await as('yousef').post(`/evidence-links/${state.link2}/unpost`, { reason: 'Wrong portal entry' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
    const queue = (await as('yousef').get(`/cycles/${w.cycleId}/submission-queue?status=posted`)).body.data;
    expect(queue.map((l: any) => [l.id, l.submission_status, l.cycleOpen])).toEqual([[state.link2, 'posted', false]]);
  });

  it('C5: GET /tasks/:id shows can.workEvidence = false (and no other action) on a closed cycle', async () => {
    const d = (await as('ali').get(`/tasks/${s.task}`)).body.data;
    expect(d.can).toEqual({
      cycleOpen: false, assign: false, start: false, workEvidence: false, askClarification: false,
      askForMoreTime: false, requestExtension: false, escalate: false, cancel: false,
    });
    expect((await as('ali').post(`/tasks/${s.task}/start`)).status).toBe(409);
    const up = await as('ali').upload(`/tasks/${s.task}/evidence`).field('title', 'late').attach('file', Buffer.from('%PDF late C5'), 'late.pdf');
    expect(up.status).toBe(409);
  });

  it('C5 positive control: after the administrator reopens with a reason, unposting and work are allowed again', async () => {
    expect((await as('alaa').post(`/cycles/${w.cycleId}/transition`, { event: 'reopen', reason: 'Late DGA correction' })).status).toBe(403);
    expect((await as('tariq').post(`/cycles/${w.cycleId}/transition`, { event: 'reopen' })).status).toBe(422);
    expect((await as('tariq').post(`/cycles/${w.cycleId}/transition`, { event: 'reopen', reason: 'Late DGA correction' })).status).toBe(200);
    expect((await as('ali').get(`/tasks/${s.task}`)).body.data.can).toMatchObject({ cycleOpen: true, workEvidence: true, start: true });
    expect((await as('yousef').post(`/evidence-links/${state.link2}/unpost`, { reason: 'Wrong portal entry' })).status).toBe(200);
    expect((await as('ali').post(`/tasks/${s.task}/start`)).status).toBe(200);
  });
});
