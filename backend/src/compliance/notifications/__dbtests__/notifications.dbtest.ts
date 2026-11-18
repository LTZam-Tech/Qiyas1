import { Client } from 'pg';
import { connectTestDb, createUser, deactivateUser, reactivateUser, resetSchema, roleId } from '../../db/__dbtests__/testDb';
import { linkEvidence, submitEvidence, uploadEvidence } from '../../evidence/evidence';
import { acceptEvidence, claimEvidence } from '../../evidence/review';
import { DevScanner, EICAR_TEST_STRING, InMemoryStorage } from '../../evidence/storage';
import { answerClarification, requestClarification } from '../../work/clarifications';
import { approveExtension, requestExtension } from '../../work/extensions';
import { assignTask } from '../../work/tasks';
import { World, at, buildWorld, endOfLocalDay } from '../../work/__dbtests__/world';
import { dispatchAuditEvents } from '../dispatcher';
import { Mailer, OutgoingEmail, sendPendingEmails } from '../mailer';
import { runScheduler } from '../scheduler';

let db: Client;
let w: World;
const deps = () => ({ storage: new InMemoryStorage(), scanner: new DevScanner() });

beforeAll(async () => {
  db = await connectTestDb();
  await resetSchema(db);
});
afterAll(async () => db?.end());
beforeEach(async () => {
  await db.query('BEGIN');
  w = await buildWorld(db);
});
afterEach(async () => db.query('ROLLBACK'));

const inbox = async (user: keyof World['users']) =>
  (await db.query('SELECT event_code FROM qiyas.notifications WHERE user_id = $1 AND show_in_app ORDER BY created_at, event_code', [w.users[user]])).rows.map((r) => r.event_code);
const count = async (user: keyof World['users'], event: string) =>
  (await db.query('SELECT count(*)::int AS n FROM qiyas.notifications WHERE user_id = $1 AND event_code = $2', [w.users[user], event])).rows[0].n;
const calendar = async () => (await w.ctx('alaa')).calendar;
const tick = async (now: Date) => runScheduler({ db, now, calendar: await calendar() });

async function aliTask() {
  const taskId = await w.publishedTask();
  await assignTask(await w.ctx('mona'), taskId, w.users.ali);
  return taskId;
}

describe('event notifications from the audit log', () => {
  it('publishing notifies the department manager; the dispatcher never duplicates', async () => {
    await w.publishedTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    await dispatchAuditEvents(db, at(2026, 11, 15));
    expect(await count('mona', 'assignment.published')).toBe(1);
    expect(await inbox('mona')).toContain('cycle.opened');
  });

  it('assignment notifies the new owner, not the manager who did it', async () => {
    await aliTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    expect(await count('ali', 'task.assigned')).toBe(1);
    expect(await count('mona', 'task.assigned')).toBe(0);
  });

  it('clarifications reach all consultants and, for an employee, the manager (D4); the answer returns to the asker', async () => {
    const taskId = await aliTask();
    const id = await requestClarification(await w.ctx('ali'), taskId, { question: 'Which template?' });
    await answerClarification(await w.ctx('mona'), id, 'Use the DGA template.');
    await dispatchAuditEvents(db, at(2026, 11, 15));
    for (const u of ['alaa', 'ahmad', 'mona'] as const) expect(await count(u, 'clarification.requested')).toBe(1);
    expect(await count('ali', 'clarification.answered')).toBe(1);
    expect(await count('alaa', 'clarification.answered_by_manager')).toBe(1); // Alaa created the assignment
  });

  it('a quarantined file alerts the uploader and the administrator', async () => {
    const taskId = await aliTask();
    await uploadEvidence(await w.ctx('ali'), deps(), { taskId, title: 'bad', file: { content: Buffer.from(EICAR_TEST_STRING), filename: 'x.pdf' } });
    await dispatchAuditEvents(db, at(2026, 11, 15));
    expect(await count('ali', 'evidence.quarantined')).toBe(1);
    expect(await count('tariq', 'evidence.quarantined')).toBe(1);
  });

  it('mutes apply to optional notifications only', async () => {
    await db.query(`INSERT INTO qiyas.notification_mutes (user_id, event_code, channel) VALUES ($1, 'task.assigned', 'in_app'), ($1, 'task.assigned', 'email')`, [w.users.mona]);
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users.mona); // self-assignment: optional for Mona
    await dispatchAuditEvents(db, at(2026, 11, 15));
    expect(await count('mona', 'task.assigned')).toBe(0);
    // mandatory (✱) ones ignore mutes
    await db.query(`INSERT INTO qiyas.notification_mutes (user_id, event_code, channel) VALUES ($1, 'assignment.published', 'in_app')`, [w.users.mona]);
    await w.publishedTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    expect(await count('mona', 'assignment.published')).toBe(2);
  });
});

describe('deadline scheduler (task due end of Sunday 22 Nov)', () => {
  it('reminds at 5, 2 and 1 working days, once each, then escalates automatically', async () => {
    await aliTask();
    await tick(at(2026, 11, 15, 9)); // Sun 15: 5.6 working days left (Sun 22 is a full working day)
    expect(await count('ali', 'task.deadline_reminder')).toBe(0);
    await tick(at(2026, 11, 16, 9)); // Mon 16: 4.6 left → the 5-day reminder
    await tick(at(2026, 11, 16, 10)); // same threshold again: nothing new
    expect(await count('ali', 'task.deadline_reminder')).toBe(1);
    await tick(at(2026, 11, 19, 9)); // Thu 19: 1.6 left → the 2-day reminder
    expect(await count('ali', 'task.deadline_reminder')).toBe(2);
    await tick(at(2026, 11, 22, 9)); // Sun 22: 15 hours left → the 1-day reminder
    expect(await count('ali', 'task.deadline_reminder')).toBe(3);

    const report = await tick(at(2026, 11, 23, 9)); // overdue
    expect(report.escalations).toBe(1);
    expect(await count('mona', 'task.escalated')).toBe(1);
    expect(await count('ali', 'task.escalated_from_you')).toBe(1);
    expect(await count('alaa', 'task.overdue')).toBe(1); // the responsible consultant
  });

  it('D2: a manager-owned overdue task escalates to the manager himself, then reminds him every 3 working days', async () => {
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users.mona);
    await tick(at(2026, 11, 23, 9));
    expect(await count('mona', 'task.escalated_to_self')).toBe(1);
    await tick(at(2026, 11, 25, 9)); // 2 working days late
    expect(await count('mona', 'task.overdue_reminder')).toBe(0);
    await tick(at(2026, 11, 26, 9)); // 3 working days late
    await tick(at(2026, 11, 26, 10));
    expect(await count('mona', 'task.overdue_reminder')).toBe(1);
  });

  it('a paused deadline (open clarification) sends no reminders', async () => {
    const taskId = await aliTask();
    await requestClarification(await w.ctx('ali'), taskId, { question: 'Which plan?' });
    await tick(at(2026, 11, 22, 9));
    expect(await count('ali', 'task.deadline_reminder')).toBe(0);
  });

  it('a late review alerts the reviewer and the Compliance Oversight group; late posting alerts the officers', async () => {
    await db.query(`INSERT INTO qiyas.group_members (group_id, user_id) SELECT id, $1 FROM qiyas.groups WHERE code = 'compliance_oversight'`, [w.users.tariq]);
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const d = deps();
    const up = await uploadEvidence(ali, d, { taskId, title: 'Strategy', file: { content: Buffer.from('%PDF plan'), filename: 'plan.pdf' } });
    const linkId = await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId });
    await submitEvidence(ali, taskId); // review due 5 working days after Sun 15 → Sun 22
    await tick(at(2026, 11, 23, 9));
    expect(await count('tariq', 'evidence.review_overdue')).toBe(1);
    expect(await count('ahmad', 'evidence.review_overdue')).toBe(1); // unclaimed: all consultants

    const ahmad = await w.ctx('ahmad', at(2026, 11, 23, 10));
    await claimEvidence(ahmad, linkId);
    await acceptEvidence(ahmad, linkId);
    await tick(at(2026, 12, 1, 9)); // accepted Mon 23 + 5 working days = Sun 30
    expect(await count('yousef', 'submission.overdue')).toBe(1);
    expect(await count('yousef', 'submission.ready')).toBe(1);
  });
});

describe('email delivery', () => {
  class FlakyMailer implements Mailer {
    sent: OutgoingEmail[] = [];
    constructor(private failures: number) {}
    async send(e: OutgoingEmail) {
      if (this.failures-- > 0) throw new Error('SMTP unavailable');
      this.sent.push(e);
    }
  }

  it('sends in the recipient\'s language and retries after a failure', async () => {
    await db.query(`INSERT INTO qiyas.user_preferences (user_id, language) VALUES ($1, 'ur')`, [w.users.ali]);
    await aliTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    await db.query(`UPDATE qiyas.notifications SET email_status = 'skipped' WHERE user_id <> $1`, [w.users.ali]);
    const mailer = new FlakyMailer(1);
    expect(await sendPendingEmails(db, mailer, at(2026, 11, 15, 10))).toMatchObject({ sent: 0, failed: 1 });
    expect(await sendPendingEmails(db, mailer, at(2026, 11, 15, 10))).toMatchObject({ sent: 0 }); // waiting for retry
    expect(await sendPendingEmails(db, mailer, at(2026, 11, 15, 11))).toMatchObject({ sent: 1 });
    expect(mailer.sent[0]).toMatchObject({ to: 'ali@test.local', language: 'ur' });
    expect(mailer.sent[0].subject).toContain('آپ کو ایک کام');
  });

  it('gives up after 3 attempts and keeps the in-app notification', async () => {
    await aliTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    await db.query(`UPDATE qiyas.notifications SET email_status = 'skipped' WHERE user_id <> $1`, [w.users.ali]);
    const mailer = new FlakyMailer(10);
    for (const h of [10, 11, 12]) await sendPendingEmails(db, mailer, at(2026, 11, 15, h));
    const { rows } = await db.query(`SELECT email_status, email_attempts, show_in_app FROM qiyas.notifications WHERE user_id = $1 AND event_code = 'task.assigned'`, [w.users.ali]);
    expect(rows[0]).toEqual({ email_status: 'dead', email_attempts: 3, show_in_app: true });
  });
});

// ------------------------------------------------------------------ security remediation B6 (C17, D-C17-4)
describe('deactivated or deleted accounts get no notifications or emails (C17)', () => {
  class RecordingMailer implements Mailer {
    sent: OutgoingEmail[] = [];
    async send(e: OutgoingEmail) { this.sent.push(e); }
  }
  const grant = async (userId: string, role: string) =>
    db.query('INSERT INTO qiyas.role_grants (role_id, user_id) VALUES ($1, $2)', [await roleId(db, role), userId]);
  const emailStatus = async (user: keyof World['users'], event: string) =>
    (await db.query('SELECT email_status, show_in_app FROM qiyas.notifications WHERE user_id = $1 AND event_code = $2', [w.users[user], event])).rows;

  it('cycle.open does not notify a deactivated or soft-deleted submission officer', async () => {
    // the audit reproduction: three officers, one deactivated (updateUser status=inactive) and one
    // deleted (deleteUser) before migration 011, so their DSO grants are still live
    const officers = { active: await createUser(db, 'DsoActive'), inactive: await createUser(db, 'DsoInactive'), deleted: await createUser(db, 'DsoDeleted') };
    for (const id of Object.values(officers)) await grant(id, 'DSO');
    await deactivateUser(db, officers.inactive, 'inactive', { cascade: false });
    await deactivateUser(db, officers.deleted, 'deleted', { cascade: false });
    await db.query(`INSERT INTO qiyas.audit_log (actor_id, action, entity_type, entity_id) VALUES ($1, 'cycle.open', 'cycle', $2)`, [w.users.tariq, w.cycleId]);
    await tick(at(2026, 11, 16, 9));
    const { rows } = await db.query(`SELECT user_id FROM qiyas.notifications WHERE event_code = 'cycle.opened' AND user_id = ANY($1::uuid[])`, [Object.values(officers)]);
    expect(rows.map((r) => r.user_id)).toEqual([officers.active, officers.active]); // one per cycle.open record (the world's and this one)
    const mailer = new RecordingMailer();
    await sendPendingEmails(db, mailer, at(2026, 11, 16, 10), 500);
    const to = mailer.sent.map((e) => e.to);
    expect(to).toContain('dsoactive@test.local');
    expect(to).not.toContain('dsoinactive@test.local');
    expect(to).not.toContain('dsodeleted@test.local');
  });

  it('a deactivated consultant gets no clarification.requested', async () => {
    const taskId = await aliTask();
    await deactivateUser(db, w.users.ahmad, 'inactive', { cascade: false });
    await requestClarification(await w.ctx('ali'), taskId, { question: 'Which template?' });
    await dispatchAuditEvents(db, at(2026, 11, 15));
    expect(await count('ahmad', 'clarification.requested')).toBe(0);
    // positive control: the active consultant and the manager (D4)
    expect(await count('alaa', 'clarification.requested')).toBe(1);
    expect(await count('mona', 'clarification.requested')).toBe(1);
  });

  it('a pending email for a user deactivated after queueing is skipped, not sent', async () => {
    await aliTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    await db.query(`UPDATE qiyas.notifications SET email_status = 'skipped' WHERE user_id <> $1`, [w.users.ali]);
    expect(await emailStatus('ali', 'task.assigned')).toEqual([{ email_status: 'pending', show_in_app: true }]);
    await deactivateUser(db, w.users.ali);
    const mailer = new RecordingMailer();
    expect(await sendPendingEmails(db, mailer, at(2026, 11, 15, 10))).toMatchObject({ sent: 0 });
    expect(mailer.sent).toEqual([]);
    expect(await emailStatus('ali', 'task.assigned')).toEqual([{ email_status: 'skipped', show_in_app: true }]); // in-app kept (D-C17-4)
    // skipped for good: reactivating the account does not flush it
    await reactivateUser(db, w.users.ali);
    expect(await sendPendingEmails(db, mailer, at(2026, 11, 15, 11))).toMatchObject({ sent: 0 });
  });

  it('an active user still gets the email', async () => {
    await aliTask();
    await dispatchAuditEvents(db, at(2026, 11, 15));
    await db.query(`UPDATE qiyas.notifications SET email_status = 'skipped' WHERE user_id <> $1`, [w.users.ali]);
    await deactivateUser(db, w.users.sara); // someone else's deactivation changes nothing for Ali
    const mailer = new RecordingMailer();
    expect(await sendPendingEmails(db, mailer, at(2026, 11, 15, 10))).toMatchObject({ sent: 1 });
    expect(mailer.sent.map((e) => e.to)).toEqual(['ali@test.local']);
    expect(await emailStatus('ali', 'task.assigned')).toEqual([{ email_status: 'sent', show_in_app: true }]);
  });

  it('a late review alerts only active consultants and oversight members', async () => {
    await db.query(`INSERT INTO qiyas.group_members (group_id, user_id) SELECT id, u FROM qiyas.groups, unnest($1::uuid[]) AS u WHERE code = 'compliance_oversight'`,
      [[w.users.tariq, w.users.yousef]]);
    const taskId = await aliTask();
    const ali = await w.ctx('ali');
    const d = deps();
    const up = await uploadEvidence(ali, d, { taskId, title: 'Strategy', file: { content: Buffer.from('%PDF plan'), filename: 'plan.pdf' } });
    await linkEvidence(ali, up.versionId, { taskId, cycleRequirementId: w.requirementId });
    await submitEvidence(ali, taskId); // review due Sun 22
    // deactivated before migration 011: grant and group membership still in place
    await deactivateUser(db, w.users.ahmad, 'inactive', { cascade: false });
    await deactivateUser(db, w.users.yousef, 'deleted', { cascade: false });
    await tick(at(2026, 11, 23, 9));
    expect(await count('ahmad', 'evidence.review_overdue')).toBe(0);
    expect(await count('yousef', 'evidence.review_overdue')).toBe(0);
    // positive control
    expect(await count('alaa', 'evidence.review_overdue')).toBe(1);
    expect(await count('tariq', 'evidence.review_overdue')).toBe(1);
  });
});

// ------------------------------------------------------------------ security remediation B6 (C12)
describe('an approved extension date is final at approval (C12)', () => {
  it('the overdue notice is sent the day after the approved date', async () => {
    // no automatic escalation in this test, so the overdue notice stays with Ali
    await db.query(`UPDATE qiyas.sla_policies SET escalation_after_business_days = 20 WHERE timer_kind = 'implementation'`);
    const taskId = await aliTask(); // due 22 Nov
    const c = await requestClarification(await w.ctx('ali', at(2026, 11, 15, 9)), taskId, { question: 'Which edition?' });
    await answerClarification(await w.ctx('ahmad', at(2026, 11, 17, 9)), c, 'The 2025 edition.'); // 2 working days paused
    const approved = endOfLocalDay('2026-11-29', await calendar());
    const req = await requestExtension(await w.ctx('mona', at(2026, 11, 17, 10)), taskId, approved, 'Waiting for the board');
    await approveExtension(await w.ctx('alaa', at(2026, 11, 17, 11)), req);
    await tick(at(2026, 11, 29, 12));
    expect(await count('ali', 'task.overdue')).toBe(0);
    await tick(at(2026, 11, 30, 9)); // nothing at 80ae855: the deadline was 1 Dec
    expect(await count('ali', 'task.overdue')).toBe(1);
    const { rows } = await db.query(`SELECT payload->>'date' AS date FROM qiyas.notifications WHERE user_id = $1 AND event_code = 'task.overdue'`, [w.users.ali]);
    expect(rows[0].date).toBe('2026-11-29');
  });
});
