/**
 * Clarifications (BR-CLR-01..06, D1, D4).
 *
 * - The current owner (employee or manager) asks; it goes straight to the consultants.
 * - The implementation deadline pauses while the question is open (D1).
 * - Consultants answer; the department manager can also answer an employee's question (D4).
 * - The answer goes back to the requester; a follow-up reopens it and pauses again.
 */
import { ComplianceError, ServiceContext, audit, fromTransition, mustOne, requirePermission } from '../core/context';
import { assertCycleWritable } from '../core/cycleGuard';
import { addBusinessDays } from '../domain/calendar';
import { ClarificationEvent, ClarificationStatus, clarificationMachine } from '../domain/stateMachines';
import { getTask, taskActors } from './tasks';

/** Default consultant response window (configurable per installation later via SLA policies). */
export const DEFAULT_CLARIFICATION_RESPONSE_DAYS = 3;

const ASKABLE: string[] = ['awaiting_assignment', 'assigned', 'in_progress', 'rework_required'];

export interface AskInput {
  question: string;
  cycleRequirementId?: string | null;
  proofItemId?: string | null;
  responseDays?: number;
}

export async function requestClarification(ctx: ServiceContext, taskId: string, input: AskInput): Promise<string> {
  const { db } = ctx;
  const task = await getTask(db, taskId, true);
  if (task.current_owner_id !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the current owner can ask for clarification');
  await assertCycleWritable(db, { cycleId: task.cycle_id }); // C5, D-C5-3
  requirePermission(ctx, 'clarification.request', { departmentId: task.department_id, ownerIds: [task.current_owner_id] });
  if (!ASKABLE.includes(task.execution_status)) throw new ComplianceError('conflict', `Cannot ask about a ${task.execution_status} task`);
  if (!input.question?.trim()) throw new ComplianceError('validation', 'The question is empty');
  if (input.cycleRequirementId) {
    await mustOne(db, 'requirement', 'SELECT 1 FROM qiyas.task_requirements WHERE task_id = $1 AND cycle_requirement_id = $2', [taskId, input.cycleRequirementId]);
  }
  const requesterRole = taskActors(ctx, task).includes('DM') ? 'DM' : 'EMP';
  const dueAt = addBusinessDays(ctx.now, input.responseDays ?? DEFAULT_CLARIFICATION_RESPONSE_DAYS, ctx.calendar);
  const c = await mustOne(db, 'clarification', `INSERT INTO qiyas.clarifications
      (task_id, cycle_requirement_id, proof_item_id, requested_by, requester_role, response_due_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
  [taskId, input.cycleRequirementId ?? null, input.proofItemId ?? null, ctx.actor.userId, requesterRole, dueAt, ctx.now]);
  await db.query(`INSERT INTO qiyas.clarification_messages (clarification_id, author_id, author_role, body, created_at)
     VALUES ($1, $2, 'requester', $3, $4)`, [c.id, ctx.actor.userId, input.question.trim(), ctx.now]);
  await db.query(`INSERT INTO qiyas.deadline_pauses (task_id, reason, clarification_id, paused_at) VALUES ($1, 'clarification', $2, $3)`, [taskId, c.id, ctx.now]);
  await audit(ctx, { action: 'clarification.requested', entityType: 'clarification', entityId: c.id, after: { taskId, requesterRole } });
  return c.id;
}

/** Loads a clarification for an action; every caller writes, so a closed cycle refuses here (C5, D-C5-3). */
async function loadClarification(ctx: ServiceContext, id: string) {
  const c = await mustOne(ctx.db, 'clarification', `SELECT c.*, t.department_id, t.cycle_id FROM qiyas.clarifications c
     JOIN qiyas.tasks t ON t.id = c.task_id WHERE c.id = $1 FOR UPDATE OF c`, [id]);
  await assertCycleWritable(ctx.db, { cycleId: c.cycle_id });
  return c;
}

async function move(ctx: ServiceContext, c: { id: string; status: ClarificationStatus }, event: ClarificationEvent, actors: Parameters<typeof clarificationMachine.next>[2]) {
  try {
    const next = clarificationMachine.next(c.status, event, actors);
    await ctx.db.query('UPDATE qiyas.clarifications SET status = $2 WHERE id = $1', [c.id, next]);
    return next;
  } catch (e) {
    return fromTransition(e);
  }
}

/**
 * C11, D-C11-1: requester actions are authorized by current grants, not the role stored on the row.
 * The caller must be the requester and must still hold the stored requester role on the task's
 * department. A follow-up opens a new deadline pause, so it also needs current ownership of the
 * task, the clarification.request permission and an askable task status.
 */
async function requesterGate(ctx: ServiceContext, c: { task_id: string; requested_by: string; requester_role: string }, action: string, opts: { needsOwnership: boolean }) {
  if (c.requested_by !== ctx.actor.userId) throw new ComplianceError('forbidden', `Only the person who asked can ${action}`);
  const task = await getTask(ctx.db, c.task_id, opts.needsOwnership);
  const actors = taskActors(ctx, task);
  if (!actors.includes(c.requester_role as (typeof actors)[number])) {
    throw new ComplianceError('forbidden', `You no longer hold the role you asked with on this task, so you cannot ${action}`);
  }
  if (opts.needsOwnership) {
    if (task.current_owner_id !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the current owner of the task can follow up');
    requirePermission(ctx, 'clarification.request', { departmentId: task.department_id, ownerIds: [task.current_owner_id] });
    if (!ASKABLE.includes(task.execution_status)) throw new ComplianceError('conflict', `Cannot follow up on a ${task.execution_status} task`);
  }
  return actors;
}

export async function answerClarification(ctx: ServiceContext, id: string, body: string): Promise<'QC' | 'DM'> {
  const c = await loadClarification(ctx, id);
  if (!body?.trim()) throw new ComplianceError('validation', 'The answer is empty');
  const actors = taskActors(ctx, c);
  let role: 'QC' | 'DM';
  if (actors.includes('QC')) role = 'QC';
  else if (actors.includes('DM') && c.requester_role === 'EMP' && c.requested_by !== ctx.actor.userId) role = 'DM'; // D4
  else throw new ComplianceError('forbidden', 'Only a consultant, or the department manager for an employee\'s question, can answer');
  requirePermission(ctx, 'clarification.answer', { departmentId: c.department_id });

  await move(ctx, c, 'answer', [role]);
  await ctx.db.query('UPDATE qiyas.clarifications SET answered_by = $2, answered_by_role = $3, answered_at = $4 WHERE id = $1', [id, ctx.actor.userId, role, ctx.now]);
  await ctx.db.query(`INSERT INTO qiyas.clarification_messages (clarification_id, author_id, author_role, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, ctx.actor.userId, role, body.trim(), ctx.now]);
  // the deadline resumes, moved later by the paused working time (D1)
  await ctx.db.query('UPDATE qiyas.deadline_pauses SET resumed_at = $2 WHERE clarification_id = $1 AND resumed_at IS NULL', [id, ctx.now]);
  await audit(ctx, { action: 'clarification.answered', entityType: 'clarification', entityId: id, after: { answeredByRole: role } });
  return role;
}

export async function followUpClarification(ctx: ServiceContext, id: string, body: string, responseDays = DEFAULT_CLARIFICATION_RESPONSE_DAYS): Promise<void> {
  const c = await loadClarification(ctx, id);
  const actors = await requesterGate(ctx, c, 'follow up', { needsOwnership: true });
  if (!body?.trim()) throw new ComplianceError('validation', 'The message is empty');
  await move(ctx, c, 'follow_up', actors);
  await ctx.db.query('UPDATE qiyas.clarifications SET response_due_at = $2 WHERE id = $1', [id, addBusinessDays(ctx.now, responseDays, ctx.calendar)]);
  await ctx.db.query(`INSERT INTO qiyas.clarification_messages (clarification_id, author_id, author_role, body, created_at) VALUES ($1, $2, 'requester', $3, $4)`,
    [id, ctx.actor.userId, body.trim(), ctx.now]);
  await ctx.db.query(`INSERT INTO qiyas.deadline_pauses (task_id, reason, clarification_id, paused_at) VALUES ($1, 'clarification', $2, $3)`, [c.task_id, id, ctx.now]);
  await audit(ctx, { action: 'clarification.follow_up', entityType: 'clarification', entityId: id });
}

export async function closeClarification(ctx: ServiceContext, id: string): Promise<void> {
  const c = await loadClarification(ctx, id);
  const actors = await requesterGate(ctx, c, 'close it', { needsOwnership: false });
  await move(ctx, c, 'close', actors);
  await audit(ctx, { action: 'clarification.closed', entityType: 'clarification', entityId: id });
}

export async function cancelClarification(ctx: ServiceContext, id: string): Promise<void> {
  const c = await loadClarification(ctx, id);
  const actors = await requesterGate(ctx, c, 'cancel it', { needsOwnership: false });
  await move(ctx, c, 'cancel', actors);
  await ctx.db.query('UPDATE qiyas.deadline_pauses SET resumed_at = $2 WHERE clarification_id = $1 AND resumed_at IS NULL', [id, ctx.now]);
  await audit(ctx, { action: 'clarification.cancelled', entityType: 'clarification', entityId: id });
}
