/**
 * Extension requests (BR-EXT-01..05, D7).
 *
 * employee ask (EMP → DM) ──forward──► formal request (DM → QC) ──approve / reject
 * The original deadline never changes; approval sets the task's extension date.
 */
import { ComplianceError, ServiceContext, audit, fromTransition, mustOne, requirePermission } from '../core/context';
import { assertCycleWritable } from '../core/cycleGuard';
import { addBusinessDays } from '../domain/calendar';
import { actorsFor } from '../domain/permissions';
import { extensionAskMachine, extensionMachine } from '../domain/stateMachines';
import { getTask, taskActors, taskDeadline } from './tasks';

export const DEFAULT_EXTENSION_DECISION_DAYS = 2;
const OPEN = ['awaiting_assignment', 'assigned', 'in_progress', 'rework_required', 'submitted'];

async function assertLaterThanCurrent(ctx: ServiceContext, taskId: string, requestedDueAt: Date) {
  const task = await getTask(ctx.db, taskId);
  await assertCycleWritable(ctx.db, { cycleId: task.cycle_id }); // C5, D-C5-3
  if (!OPEN.includes(task.execution_status)) throw new ComplianceError('conflict', `A ${task.execution_status} task cannot be extended`);
  const deadline = await taskDeadline(ctx, task);
  if (requestedDueAt <= deadline.currentDueAt) throw new ComplianceError('validation', 'The requested date must be after the current deadline');
  if (requestedDueAt <= ctx.now) throw new ComplianceError('validation', 'The requested date must be in the future');
  return task;
}

function uniqueViolation(e: unknown): boolean {
  return (e as { code?: string })?.code === '23505';
}

/** D7: the employee who owns the task asks the manager for more time. */
export async function askForMoreTime(ctx: ServiceContext, taskId: string, requestedDueAt: Date, justification: string): Promise<string> {
  const task = await assertLaterThanCurrent(ctx, taskId, requestedDueAt);
  if (task.current_owner_id !== ctx.actor.userId || !taskActors(ctx, task).includes('EMP')) {
    throw new ComplianceError('forbidden', 'Only the employee who owns the task can ask the manager for more time');
  }
  requirePermission(ctx, 'extension.suggest', { ownerIds: [task.current_owner_id] });
  try {
    const row = await mustOne(ctx.db, 'request', `INSERT INTO qiyas.extension_requests (task_id, level, requested_by, requested_due_at, justification, status, created_at)
       VALUES ($1, 'employee_ask', $2, $3, $4, 'asked', $5) RETURNING id`, [taskId, ctx.actor.userId, requestedDueAt, justification, ctx.now]);
    await audit(ctx, { action: 'extension.asked', entityType: 'extension_request', entityId: row.id, after: { taskId, requestedDueAt } });
    return row.id;
  } catch (e) {
    if (uniqueViolation(e)) throw new ComplianceError('conflict', 'There is already an open request for more time on this task');
    throw e;
  }
}

async function insertFormal(ctx: ServiceContext, taskId: string, requestedDueAt: Date, justification: string, parentId: string | null): Promise<string> {
  try {
    const row = await mustOne(ctx.db, 'request', `INSERT INTO qiyas.extension_requests
        (task_id, level, parent_request_id, requested_by, requested_due_at, justification, status, decision_due_at, created_at)
       VALUES ($1, 'formal', $2, $3, $4, $5, 'pending', $6, $7) RETURNING id`,
    [taskId, parentId, ctx.actor.userId, requestedDueAt, justification, addBusinessDays(ctx.now, DEFAULT_EXTENSION_DECISION_DAYS, ctx.calendar), ctx.now]);
    await audit(ctx, { action: 'extension.requested', entityType: 'extension_request', entityId: row.id, after: { taskId, requestedDueAt, parentId } });
    return row.id;
  } catch (e) {
    if (uniqueViolation(e)) throw new ComplianceError('conflict', 'An extension request for this task is already waiting for the consultant');
    throw e;
  }
}

/** Only the department manager raises a formal request (BR-EXT-01). */
export async function requestExtension(ctx: ServiceContext, taskId: string, requestedDueAt: Date, justification: string): Promise<string> {
  const task = await assertLaterThanCurrent(ctx, taskId, requestedDueAt);
  if (!taskActors(ctx, task).includes('DM')) throw new ComplianceError('forbidden', 'Only the department manager can request an extension');
  requirePermission(ctx, 'extension.request', { departmentId: task.department_id });
  return insertFormal(ctx, taskId, requestedDueAt, justification, null);
}

/** Every caller writes, so a closed cycle refuses here (C5, D-C5-3). */
async function loadAsk(ctx: ServiceContext, id: string) {
  const ask = await mustOne(ctx.db, 'request', `SELECT e.*, t.department_id, t.cycle_id FROM qiyas.extension_requests e JOIN qiyas.tasks t ON t.id = e.task_id
     WHERE e.id = $1 AND e.level = 'employee_ask' FOR UPDATE OF e`, [id]);
  await assertCycleWritable(ctx.db, { cycleId: ask.cycle_id });
  return ask;
}

/** The manager turns the employee's ask into a formal request, optionally adjusting date and reason. */
export async function forwardAsk(ctx: ServiceContext, askId: string, edits: { requestedDueAt?: Date; justification?: string } = {}): Promise<string> {
  const ask = await loadAsk(ctx, askId);
  let next;
  try {
    next = extensionAskMachine.next(ask.status, 'forward', taskActors(ctx, ask));
  } catch (e) {
    return fromTransition(e);
  }
  const due = edits.requestedDueAt ?? new Date(ask.requested_due_at);
  await assertLaterThanCurrent(ctx, ask.task_id, due);
  await ctx.db.query('UPDATE qiyas.extension_requests SET status = $2, decided_by = $3, decided_at = $4 WHERE id = $1', [askId, next, ctx.actor.userId, ctx.now]);
  return insertFormal(ctx, ask.task_id, due, edits.justification ?? ask.justification, askId);
}

export async function declineAsk(ctx: ServiceContext, askId: string, reason: string): Promise<void> {
  const ask = await loadAsk(ctx, askId);
  let next;
  try {
    next = extensionAskMachine.next(ask.status, 'decline', taskActors(ctx, ask), reason);
  } catch (e) {
    return fromTransition(e);
  }
  await ctx.db.query('UPDATE qiyas.extension_requests SET status = $2, decided_by = $3, decided_at = $4, decision_reason = $5 WHERE id = $1',
    [askId, next, ctx.actor.userId, ctx.now, reason]);
  await audit(ctx, { action: 'extension.ask_declined', entityType: 'extension_request', entityId: askId, reason });
}

/** Every caller writes, so a closed cycle refuses here (C5, D-C5-3). */
async function loadFormal(ctx: ServiceContext, id: string) {
  // C11: joins the task so callers can check current grants against its department
  const r = await mustOne(ctx.db, 'request', `SELECT e.*, t.department_id, t.cycle_id FROM qiyas.extension_requests e JOIN qiyas.tasks t ON t.id = e.task_id
     WHERE e.id = $1 AND e.level = 'formal' FOR UPDATE OF e`, [id]);
  await assertCycleWritable(ctx.db, { taskId: r.task_id });
  return r;
}

export async function approveExtension(ctx: ServiceContext, requestId: string, approvedDueAt?: Date): Promise<Date> {
  const r = await loadFormal(ctx, requestId);
  if (r.requested_by === ctx.actor.userId) throw new ComplianceError('forbidden', 'Nobody decides an extension they requested'); // SoD-2
  let next;
  try {
    next = extensionMachine.next(r.status, 'approve', actorsFor(ctx.actor.grants, null));
  } catch (e) {
    return fromTransition(e);
  }
  requirePermission(ctx, 'extension.decide');
  const due = approvedDueAt ?? new Date(r.requested_due_at);
  if (due <= ctx.now) throw new ComplianceError('validation', 'The approved date must be in the future');
  await ctx.db.query('UPDATE qiyas.extension_requests SET status = $2, decided_by = $3, decided_at = $4, approved_due_at = $5 WHERE id = $1',
    [requestId, next, ctx.actor.userId, ctx.now, due]);
  const task = await getTask(ctx.db, r.task_id, true);
  // C12: the approval time is recorded so only later pauses move the approved date (BR-EXT-03)
  await ctx.db.query('UPDATE qiyas.tasks SET approved_extension_due_at = $2, approved_extension_at = $3 WHERE id = $1', [r.task_id, due, ctx.now]);
  await audit(ctx, { action: 'extension.approved', entityType: 'task', entityId: r.task_id,
    before: { extensionDueAt: task.approved_extension_due_at }, after: { extensionDueAt: due, requestId } });
  return due;
}

export async function rejectExtension(ctx: ServiceContext, requestId: string, reason: string): Promise<void> {
  const r = await loadFormal(ctx, requestId);
  if (r.requested_by === ctx.actor.userId) throw new ComplianceError('forbidden', 'Nobody decides an extension they requested');
  let next;
  try {
    next = extensionMachine.next(r.status, 'reject', actorsFor(ctx.actor.grants, null), reason);
  } catch (e) {
    return fromTransition(e);
  }
  requirePermission(ctx, 'extension.decide');
  await ctx.db.query('UPDATE qiyas.extension_requests SET status = $2, decided_by = $3, decided_at = $4, decision_reason = $5 WHERE id = $1',
    [requestId, next, ctx.actor.userId, ctx.now, reason]);
  await audit(ctx, { action: 'extension.rejected', entityType: 'extension_request', entityId: requestId, reason });
}

export async function withdrawExtension(ctx: ServiceContext, requestId: string): Promise<void> {
  const r = await loadFormal(ctx, requestId);
  if (r.requested_by !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the manager who asked can withdraw it');
  // C11, D-C11-2: the requester may withdraw only while still holding DM for the task's department
  const actors = taskActors(ctx, r);
  if (!actors.includes('DM')) throw new ComplianceError('forbidden', 'Only the current department manager who asked can withdraw it');
  requirePermission(ctx, 'extension.request', { departmentId: r.department_id });
  try {
    const next = extensionMachine.next(r.status, 'withdraw', actors);
    await ctx.db.query('UPDATE qiyas.extension_requests SET status = $2 WHERE id = $1', [requestId, next]);
  } catch (e) {
    return fromTransition(e);
  }
  await audit(ctx, { action: 'extension.withdrawn', entityType: 'extension_request', entityId: requestId });
}
