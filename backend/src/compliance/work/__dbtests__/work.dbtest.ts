import { Client } from 'pg';
import { ComplianceError } from '../../core/context';
import { localDateKey } from '../../domain/calendar';
import sample from '../../framework/samples/dga-v5.0-sample.json';
import { importFramework, setApplicability, transitionCycle } from '../../framework/frameworkService';
import { connectTestDb, resetSchema } from '../../db/__dbtests__/testDb';
import { answerClarification, cancelClarification, followUpClarification, requestClarification } from '../clarifications';
import { escalateManually, runAutomaticEscalations } from '../escalations';
import { approveExtension, askForMoreTime, declineAsk, forwardAsk, rejectExtension, requestExtension } from '../extensions';
import { assignTask, cancelAssignment, createAssignment, getTask, publishAssignment, startTask, taskDeadline } from '../tasks';
import { T0, World, at, buildWorld } from './world';

let db: Client;
let w: World;

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

/** Expects a ComplianceError with this code, inside a savepoint so the test transaction survives. */
async function fails(code: string, fn: () => Promise<unknown>): Promise<string> {
  await db.query('SAVEPOINT f');
  try {
    await fn();
  } catch (e) {
    await db.query('ROLLBACK TO SAVEPOINT f');
    if (e instanceof ComplianceError) {
      expect(e.code).toBe(code);
      return e.message;
    }
    throw e;
  }
  throw new Error(`expected a ${code} error`);
}

const dateKey = (d: Date) => localDateKey(d, { utcOffsetMinutes: 180, weekendDays: [5, 6], holidays: [] });

describe('framework and cycle', () => {
  it('imports the DGA sample and tracks its top-level requirement in the cycle', async () => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM qiyas.requirements');
    expect(rows[0].n).toBe(5); // 1 requirement + 4 sub-conditions
    const cr = await db.query('SELECT count(*)::int AS n FROM qiyas.cycle_requirements WHERE cycle_id = $1', [w.cycleId]);
    expect(cr.rows[0].n).toBe(1);
  });

  it('refuses a second import of the same version, and employees cannot import', async () => {
    await fails('conflict', async () => importFramework(await w.ctx('alaa'), sample));
    await fails('forbidden', async () => importFramework(await w.ctx('ali'), sample));
  });

  it('applicability needs a reason; closing a cycle makes its bank read-only; only admins reopen', async () => {
    const alaa = await w.ctx('alaa');
    await fails('validation', () => setApplicability(alaa, w.requirementId, false));
    await setApplicability(alaa, w.requirementId, false, 'Exempted by decree 123');
    expect((await db.query('SELECT readiness FROM qiyas.cycle_requirements WHERE id = $1', [w.requirementId])).rows[0].readiness).toBe('not_applicable');
    await transitionCycle(alaa, w.cycleId, 'close');
    expect((await db.query('SELECT status FROM qiyas.evidence_banks WHERE id = $1', [w.bankId])).rows[0].status).toBe('read_only');
    await fails('forbidden', () => transitionCycle(alaa, w.cycleId, 'reopen', 'late fix'));
    await transitionCycle(await w.ctx('tariq'), w.cycleId, 'reopen', 'late fix');
  });
});

describe('assignment and ownership', () => {
  it('publishing creates a task owned by the department manager, awaiting assignment', async () => {
    const t = await getTask(db, await w.publishedTask());
    expect(t.execution_status).toBe('awaiting_assignment');
    expect(t.current_owner_id).toBe(w.users.mona);
    expect(t.original_assignee_id).toBeNull();
  });

  it('only consultants assign to departments; a department without a manager is refused', async () => {
    const base = { cycleId: w.cycleId, cycleRequirementIds: [w.requirementId], title: 'x', implementationDueAt: at(2026, 11, 25), managerDueAt: at(2026, 11, 17) };
    await fails('forbidden', async () => createAssignment(await w.ctx('mona'), { ...base, departmentId: w.depts.it }));
    const alaa = await w.ctx('alaa');
    const id = await createAssignment(alaa, { ...base, departmentId: w.depts.noManager });
    await fails('conflict', () => publishAssignment(alaa, id));
  });

  it('a past deadline or a not-applicable requirement is refused', async () => {
    const alaa = await w.ctx('alaa');
    const base = { cycleId: w.cycleId, departmentId: w.depts.it, cycleRequirementIds: [w.requirementId], title: 'x', managerDueAt: at(2026, 11, 10) };
    await fails('validation', () => createAssignment(alaa, { ...base, implementationDueAt: at(2026, 11, 12) }));
    await setApplicability(alaa, w.requirementId, false, 'Not in scope for this entity');
    await fails('validation', () => createAssignment(alaa, { ...base, implementationDueAt: at(2026, 11, 25) }));
  });

  it('the manager assigns and reassigns; the original assignee never changes (BR-ASG-05)', async () => {
    const taskId = await w.publishedTask();
    const mona = await w.ctx('mona');
    await assignTask(mona, taskId, w.users.ali);
    let t = await getTask(db, taskId);
    expect([t.execution_status, t.current_owner_id, t.original_assignee_id]).toEqual(['assigned', w.users.ali, w.users.ali]);
    await assignTask(mona, taskId, w.users.sara, 'Ali is on leave');
    t = await getTask(db, taskId);
    expect([t.current_owner_id, t.original_assignee_id]).toEqual([w.users.sara, w.users.ali]);
    const h = await db.query('SELECT reason_kind FROM qiyas.task_ownership_history WHERE task_id = $1 ORDER BY at, reason_kind', [taskId]);
    expect(h.rows.map((r) => r.reason_kind).sort()).toEqual(['assign', 'publish', 'reassign']);
    await db.query('SAVEPOINT g');
    await expect(db.query('UPDATE qiyas.tasks SET original_assignee_id = $2 WHERE id = $1', [taskId, w.users.sara])).rejects.toThrow('original assignee');
    await db.query('ROLLBACK TO SAVEPOINT g');
  });

  it('the manager can take the task personally; others in the department cannot assign', async () => {
    const taskId = await w.publishedTask();
    await fails('forbidden', async () => assignTask(await w.ctx('ali'), taskId, w.users.ali));
    await assignTask(await w.ctx('mona'), taskId, w.users.mona);
    expect((await getTask(db, taskId)).current_owner_id).toBe(w.users.mona);
  });

  it('SoD-3: a manager cannot assign outside his department, nor another department\'s task', async () => {
    const taskId = await w.publishedTask();
    await fails('validation', async () => assignTask(await w.ctx('mona'), taskId, w.users.huda));
    await fails('forbidden', async () => assignTask(await w.ctx('khalid'), taskId, w.users.huda));
  });

  it('only the owner starts the task; cancelling an assignment cancels its task with the reason', async () => {
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users.ali);
    await fails('forbidden', async () => startTask(await w.ctx('sara'), taskId));
    await startTask(await w.ctx('ali'), taskId);
    const t = await getTask(db, taskId);
    expect(t.execution_status).toBe('in_progress');
    await fails('validation', async () => cancelAssignment(await w.ctx('alaa'), t.assignment_id, ''));
    await cancelAssignment(await w.ctx('alaa'), t.assignment_id, 'Moved to another department');
    expect((await getTask(db, taskId)).execution_status).toBe('cancelled');
  });
});

describe('clarification (D1, D4)', () => {
  async function workingTask(owner: 'ali' | 'mona' = 'ali') {
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users[owner]);
    return taskId;
  }

  it('the owner asks; the deadline pauses until it is answered, then moves later', async () => {
    const taskId = await workingTask();
    const before = await taskDeadline(await w.ctx('ali'), await getTask(db, taskId));
    const id = await requestClarification(await w.ctx('ali'), taskId, { question: 'Which plan version is accepted?', cycleRequirementId: w.requirementId });
    const paused = await taskDeadline(await w.ctx('ali', at(2026, 11, 16)), await getTask(db, taskId));
    expect(paused.isPaused).toBe(true);
    // Ahmad answers a full working day later
    await answerClarification(await w.ctx('ahmad', at(2026, 11, 16)), id, 'The approved 2025–2027 edition.');
    const after = await taskDeadline(await w.ctx('ali', at(2026, 11, 16)), await getTask(db, taskId));
    expect(after.isPaused).toBe(false);
    expect(dateKey(before.currentDueAt)).toBe('2026-11-22');
    expect(dateKey(after.currentDueAt)).toBe('2026-11-23');
    expect(after.originalDueAt.getTime()).toBe(before.originalDueAt.getTime());
  });

  it('D4: the manager can answer an employee\'s question, and nobody else in the department can', async () => {
    const taskId = await workingTask();
    const id = await requestClarification(await w.ctx('ali'), taskId, { question: 'Is a draft acceptable?' });
    await fails('forbidden', async () => answerClarification(await w.ctx('sara'), id, 'yes'));
    await fails('forbidden', async () => answerClarification(await w.ctx('khalid'), id, 'yes'));
    expect(await answerClarification(await w.ctx('mona'), id, 'No, it must be approved.')).toBe('DM');
  });

  it('the manager\'s own question goes to the consultants only', async () => {
    const taskId = await workingTask('mona');
    const id = await requestClarification(await w.ctx('mona'), taskId, { question: 'Can two departments share this?' });
    await fails('forbidden', async () => answerClarification(await w.ctx('mona'), id, 'yes'));
    expect(await answerClarification(await w.ctx('alaa'), id, 'Yes, with separate assignments.')).toBe('QC');
  });

  it('only the current owner asks; a follow-up pauses again; cancelling resumes', async () => {
    const taskId = await workingTask();
    await fails('forbidden', async () => requestClarification(await w.ctx('sara'), taskId, { question: 'x' }));
    const id = await requestClarification(await w.ctx('ali'), taskId, { question: 'First question' });
    await answerClarification(await w.ctx('alaa'), id, 'Answer one');
    await followUpClarification(await w.ctx('ali'), id, 'And the annex?');
    expect((await taskDeadline(await w.ctx('ali'), await getTask(db, taskId))).isPaused).toBe(true);
    await cancelClarification(await w.ctx('ali'), id);
    expect((await taskDeadline(await w.ctx('ali'), await getTask(db, taskId))).isPaused).toBe(false);
    await fails('conflict', async () => cancelClarification(await w.ctx('ali'), id));
  });
});

describe('extensions (D7)', () => {
  async function aliTask() {
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users.ali);
    return taskId;
  }

  it('employee asks, manager forwards, consultant approves; the original deadline is kept', async () => {
    const taskId = await aliTask();
    const askId = await askForMoreTime(await w.ctx('ali'), taskId, at(2026, 11, 26), 'Waiting for the signed copy');
    const formalId = await forwardAsk(await w.ctx('mona'), askId);
    await fails('conflict', async () => requestExtension(await w.ctx('mona'), taskId, at(2026, 11, 30), 'second request'));
    await fails('forbidden', async () => approveExtension(await w.ctx('mona'), formalId));
    const due = await approveExtension(await w.ctx('ahmad'), formalId);
    const t = await getTask(db, taskId);
    expect(new Date(t.approved_extension_due_at!).getTime()).toBe(due.getTime());
    expect(dateKey(new Date(t.original_due_at))).toBe('2026-11-22');
    const d = await taskDeadline(await w.ctx('ali'), t);
    expect(d.currentDueAt.getTime()).toBe(due.getTime());
  });

  it('the manager can decline the employee\'s ask with a reason', async () => {
    const taskId = await aliTask();
    const askId = await askForMoreTime(await w.ctx('ali'), taskId, at(2026, 11, 26), 'Need more time');
    await fails('validation', async () => declineAsk(await w.ctx('mona'), askId, ''));
    await declineAsk(await w.ctx('mona'), askId, 'The plan already exists');
  });

  it('only the manager raises a formal request; rejection needs a reason and keeps the deadline', async () => {
    const taskId = await aliTask();
    await fails('forbidden', async () => requestExtension(await w.ctx('ali'), taskId, at(2026, 11, 26), 'more time'));
    await fails('validation', async () => requestExtension(await w.ctx('mona'), taskId, at(2026, 11, 20), 'earlier than due'));
    const id = await requestExtension(await w.ctx('mona'), taskId, at(2026, 11, 26), 'Board meets on the 25th');
    await fails('validation', async () => rejectExtension(await w.ctx('alaa'), id, ''));
    await rejectExtension(await w.ctx('alaa'), id, 'The board date is not a valid reason');
    expect((await getTask(db, taskId)).approved_extension_due_at).toBeNull();
  });
});

describe('escalation (BR-ESC, D2)', () => {
  async function aliTask() {
    const taskId = await w.publishedTask();
    await assignTask(await w.ctx('mona'), taskId, w.users.ali);
    return taskId;
  }

  it('manual: ownership moves to the manager, the original employee is kept, history recorded', async () => {
    const taskId = await aliTask();
    await fails('forbidden', async () => escalateManually(await w.ctx('mona'), taskId, 'late'));
    const r = await escalateManually(await w.ctx('alaa'), taskId, 'No progress after two reminders');
    expect([r.kind, r.selfEscalation, r.from, r.to]).toEqual(['manual', false, w.users.ali, w.users.mona]);
    const t = await getTask(db, taskId);
    expect([t.current_owner_id, t.original_assignee_id, t.is_escalated]).toEqual([w.users.mona, w.users.ali, true]);
    // after escalation the manager can solve it or hand it to someone else
    await assignTask(await w.ctx('mona'), taskId, w.users.sara);
  });

  it('automatic: fires once after the deadline, never while paused, and re-arms after an extension', async () => {
    const taskId = await aliTask();
    const sys = async (now: Date) => ({ db, now, calendar: (await w.ctx('alaa', now)).calendar });
    expect(await runAutomaticEscalations(await sys(at(2026, 11, 22, 12)))).toEqual([]); // still before end of the 22nd
    const late = at(2026, 11, 23, 9);
    const first = await runAutomaticEscalations(await sys(late));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'automatic', from: w.users.ali, to: w.users.mona });
    expect(await runAutomaticEscalations(await sys(at(2026, 11, 24)))).toEqual([]); // once per deadline

    // D2: the manager now owns it; after a new deadline passes, the escalation goes to the manager himself
    const req = await requestExtension(await w.ctx('mona', late), taskId, at(2026, 11, 26), 'Waiting for signatures');
    await approveExtension(await w.ctx('alaa', late), req);
    const again = await runAutomaticEscalations(await sys(at(2026, 11, 29, 10)));
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ selfEscalation: true, from: w.users.mona, to: w.users.mona });
  });

  it('a task waiting on a clarification is not escalated automatically (D1)', async () => {
    const taskId = await aliTask();
    await requestClarification(await w.ctx('ali'), taskId, { question: 'Which template?' });
    const calendar = (await w.ctx('alaa')).calendar;
    expect(await runAutomaticEscalations({ db, now: at(2026, 12, 10), calendar })).toEqual([]);
  });

  it('escalation records cannot be edited or deleted', async () => {
    const taskId = await aliTask();
    const r = await escalateManually(await w.ctx('ahmad'), taskId, 'Escalating for visibility');
    await db.query('SAVEPOINT h');
    await expect(db.query('DELETE FROM qiyas.escalations WHERE id = $1', [r.escalationId])).rejects.toThrow('append-only');
    await db.query('ROLLBACK TO SAVEPOINT h');
  });
});

it('every change leaves an audit record', async () => {
  const taskId = await w.publishedTask();
  await assignTask(await w.ctx('mona'), taskId, w.users.ali);
  const { rows } = await db.query(`SELECT action FROM qiyas.audit_log WHERE entity_id = $1 ORDER BY id`, [taskId]);
  expect(rows.map((r) => r.action)).toEqual(['task.publish', 'task.assign', 'task.assign']);
  expect(T0.toISOString()).toBe('2026-11-15T06:00:00.000Z');
});
