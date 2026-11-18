/**
 * Escalation (BR-ESC-01..07, D2).
 *
 * Manual: a consultant escalates any open task, with a reason.
 * Automatic: the scheduler escalates tasks past their deadline + threshold.
 * Both move ownership to the department manager, keep the original assignee,
 * and record an immutable escalation. If the manager already owns the task,
 * the escalation is recorded and sent to the manager himself (D2).
 */
import { ComplianceError, Db, ServiceContext, audit, departmentManager, requirePermission } from '../core/context';
import { WRITABLE_CYCLE_STATUSES, assertCycleWritable } from '../core/cycleGuard';
import { WorkCalendar } from '../domain/calendar';
import { isAutoEscalationDue } from '../domain/deadline';
import { TaskRow, getTask, taskDeadline } from './tasks';

const ESCALATABLE = ['awaiting_assignment', 'assigned', 'in_progress', 'rework_required', 'submitted'];
/** Automatic escalation follows the implementation deadline, so only while the executor is working. */
const AUTO_ESCALATABLE = ['assigned', 'in_progress', 'rework_required'];

export interface EscalationOutcome {
  escalationId: string;
  taskId: string;
  kind: 'manual' | 'automatic';
  selfEscalation: boolean;
  from: string;
  to: string;
}

async function escalate(
  db: Db, now: Date, actorId: string | null, task: TaskRow, kind: 'manual' | 'automatic', reason: string, dueAtSnapshot: Date | null,
): Promise<EscalationOutcome | null> {
  const manager = await departmentManager(db, task.department_id);
  if (!manager) throw new ComplianceError('conflict', 'The department has no manager to escalate to');
  const from = task.current_owner_id;
  const self = from === manager;
  const inserted = await db.query(`INSERT INTO qiyas.escalations
      (task_id, kind, reason, from_owner_id, to_owner_id, self_escalation, escalated_by, due_at_snapshot, at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING RETURNING id`,
  [task.id, kind, reason, from, manager, self, kind === 'manual' ? actorId : null, dueAtSnapshot, now]);
  if (inserted.rows.length === 0) return null; // already escalated automatically for this deadline
  const id = inserted.rows[0].id as string;

  if (!self) {
    await db.query(`INSERT INTO qiyas.task_ownership_history (task_id, from_user_id, to_user_id, reason_kind, note, actor_id, at)
      VALUES ($1, $2, $3, 'escalation', $4, $5, $6)`, [task.id, from, manager, reason, actorId, now]);
  }
  await db.query('UPDATE qiyas.tasks SET current_owner_id = $2, is_escalated = TRUE WHERE id = $1', [task.id, manager]);
  await audit({ db, now, actor: actorId ? { userId: actorId } : null }, {
    action: `task.escalated.${kind}`, entityType: 'task', entityId: task.id,
    before: { owner: from }, after: { owner: manager, selfEscalation: self, escalationId: id }, reason,
  });
  return { escalationId: id, taskId: task.id, kind, selfEscalation: self, from, to: manager };
}

/** BR-ESC-01: a consultant escalates a task at any time, with a reason. */
export async function escalateManually(ctx: ServiceContext, taskId: string, reason: string): Promise<EscalationOutcome> {
  requirePermission(ctx, 'escalation.manual');
  if ((reason ?? '').trim().length < 3) throw new ComplianceError('validation', 'A reason is required to escalate');
  const task = await getTask(ctx.db, taskId, true);
  await assertCycleWritable(ctx.db, { cycleId: task.cycle_id }); // C5, D-C5-3
  if (!ESCALATABLE.includes(task.execution_status)) throw new ComplianceError('conflict', `A ${task.execution_status} task cannot be escalated`);
  const outcome = await escalate(ctx.db, ctx.now, ctx.actor.userId, task, 'manual', reason.trim(), null);
  return outcome as EscalationOutcome;
}

export interface AutoEscalationContext {
  db: Db;
  now: Date;
  calendar: WorkCalendar;
}

/**
 * Scheduler entry point (BR-ESC-02). Idempotent: at most one automatic
 * escalation per task deadline; an approved extension re-arms it.
 */
export async function runAutomaticEscalations(ctx: AutoEscalationContext, thresholdBusinessDays = 0): Promise<EscalationOutcome[]> {
  const { rows } = await ctx.db.query(
    `SELECT t.* FROM qiyas.tasks t WHERE t.execution_status = ANY($1::text[])
        AND EXISTS (SELECT 1 FROM qiyas.measurement_cycles c WHERE c.id = t.cycle_id AND c.status = ANY($2::text[])) -- C5, D-C5-3
      FOR UPDATE OF t SKIP LOCKED`, [AUTO_ESCALATABLE, WRITABLE_CYCLE_STATUSES]);
  const out: EscalationOutcome[] = [];
  for (const task of rows as TaskRow[]) {
    const deadline = await taskDeadline(ctx, task);
    if (!isAutoEscalationDue(deadline, ctx.now, thresholdBusinessDays, ctx.calendar)) continue;
    const r = await escalate(ctx.db, ctx.now, null, task, 'automatic', 'Deadline passed without submission', deadline.currentDueAt);
    if (r) out.push(r);
  }
  return out;
}
