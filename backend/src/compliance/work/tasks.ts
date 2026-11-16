/**
 * Assignments and tasks (BR-ASG-01..07, docs/phase1/03-workflows.md W2).
 *
 * Execution status changes go through taskMachine; ownership is tracked
 * separately (current owner + write-once original assignee + history).
 */
import {
  ComplianceError, Db, ServiceContext, audit, departmentManager, fromTransition, isDepartmentMember, mustOne, requirePermission,
} from '../core/context';
import { DeadlinePause, DeadlineState, computeDeadline } from '../domain/deadline';
import { actorsFor } from '../domain/permissions';
import { TaskEvent, TaskStatus, assignmentMachine, taskMachine } from '../domain/stateMachines';

export interface TaskRow {
  id: string;
  assignment_id: string;
  cycle_id: string;
  department_id: string;
  title: string;
  execution_status: TaskStatus;
  original_assignee_id: string | null;
  current_owner_id: string;
  manager_due_at: Date;
  original_due_at: Date;
  approved_extension_due_at: Date | null;
  is_escalated: boolean;
}

export async function getTask(db: Db, taskId: string, lock = false): Promise<TaskRow> {
  return mustOne<TaskRow>(db, 'task', `SELECT * FROM qiyas.tasks WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [taskId]);
}

export function taskActors(ctx: ServiceContext, task: Pick<TaskRow, 'department_id'>) {
  return actorsFor(ctx.actor.grants, task.department_id);
}

/** Applies a task status transition (with audit) and returns the new status. */
export async function moveTask(ctx: ServiceContext, task: TaskRow, event: TaskEvent, actors = taskActors(ctx, task), reason?: string): Promise<TaskStatus> {
  let next: TaskStatus;
  try {
    next = taskMachine.next(task.execution_status, event, actors, reason);
  } catch (e) {
    return fromTransition(e);
  }
  await ctx.db.query('UPDATE qiyas.tasks SET execution_status = $2 WHERE id = $1', [task.id, next]);
  await audit(ctx, { action: `task.${event}`, entityType: 'task', entityId: task.id, before: { status: task.execution_status }, after: { status: next }, reason });
  task.execution_status = next;
  return next;
}

async function recordOwnership(ctx: ServiceContext, task: TaskRow, to: string, kind: string, note?: string | null) {
  await ctx.db.query(`INSERT INTO qiyas.task_ownership_history (task_id, from_user_id, to_user_id, reason_kind, note, actor_id, at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`, [task.id, task.current_owner_id, to, kind, note ?? null, ctx.actor.userId, ctx.now]);
}

// ------------------------------------------------------------------ assignments
export interface NewAssignment {
  cycleId: string;
  departmentId: string;
  cycleRequirementIds: string[];
  title: string;
  instructions?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  implementationDueAt: Date;
  managerDueAt: Date;
}

export async function createAssignment(ctx: ServiceContext, input: NewAssignment): Promise<string> {
  requirePermission(ctx, 'assignment.create');
  const { db } = ctx;
  if (input.cycleRequirementIds.length === 0) throw new ComplianceError('validation', 'Choose at least one requirement');
  if (input.implementationDueAt <= ctx.now) throw new ComplianceError('validation', 'The deadline must be in the future');
  if (input.managerDueAt > input.implementationDueAt) throw new ComplianceError('validation', 'The manager action deadline must come before the implementation deadline');
  const cycle = await mustOne(db, 'cycle', 'SELECT status FROM qiyas.measurement_cycles WHERE id = $1', [input.cycleId]);
  if (cycle.status !== 'planning' && cycle.status !== 'active') throw new ComplianceError('conflict', `The cycle is ${cycle.status}`);
  await mustOne(db, 'department', 'SELECT id FROM qiyas.departments WHERE id = $1 AND is_active', [input.departmentId]);
  const { rows } = await db.query(`SELECT id, is_applicable FROM qiyas.cycle_requirements WHERE cycle_id = $1 AND id = ANY($2::uuid[])`,
    [input.cycleId, input.cycleRequirementIds]);
  if (rows.length !== new Set(input.cycleRequirementIds).size) throw new ComplianceError('validation', 'Some requirements are not part of this cycle');
  if (rows.some((r) => !r.is_applicable)) throw new ComplianceError('validation', 'Not-applicable requirements cannot be assigned');

  const a = await mustOne(db, 'assignment', `INSERT INTO qiyas.assignments
      (cycle_id, department_id, assigned_by, title, instructions, priority, implementation_due_at, manager_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
  [input.cycleId, input.departmentId, ctx.actor.userId, input.title, input.instructions ?? null, input.priority ?? 'medium', input.implementationDueAt, input.managerDueAt]);
  for (const id of new Set(input.cycleRequirementIds)) {
    await db.query('INSERT INTO qiyas.assignment_requirements (assignment_id, cycle_requirement_id) VALUES ($1, $2)', [a.id, id]);
  }
  await audit(ctx, { action: 'assignment.created', entityType: 'assignment', entityId: a.id, after: input });
  return a.id;
}

/** Publishes an assignment: creates its task, owned by the department manager (BR-ASG-02). */
export async function publishAssignment(ctx: ServiceContext, assignmentId: string): Promise<string> {
  const { db } = ctx;
  const a = await mustOne(db, 'assignment', 'SELECT * FROM qiyas.assignments WHERE id = $1 FOR UPDATE', [assignmentId]);
  let next;
  try {
    next = assignmentMachine.next(a.status, 'publish', actorsFor(ctx.actor.grants, null));
  } catch (e) {
    return fromTransition(e);
  }
  const manager = await departmentManager(db, a.department_id);
  if (!manager) throw new ComplianceError('conflict', 'The department has no manager; ask the administrator to set one');
  await db.query('UPDATE qiyas.assignments SET status = $2, published_at = $3 WHERE id = $1', [assignmentId, next, ctx.now]);

  const task = await mustOne<TaskRow>(db, 'task', `INSERT INTO qiyas.tasks
      (assignment_id, cycle_id, department_id, title, execution_status, current_owner_id, manager_due_at, original_due_at)
     VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7) RETURNING *`,
  [a.id, a.cycle_id, a.department_id, a.title, manager, a.manager_due_at, a.implementation_due_at]);
  await db.query(`INSERT INTO qiyas.task_requirements (task_id, cycle_requirement_id)
     SELECT $1, cycle_requirement_id FROM qiyas.assignment_requirements WHERE assignment_id = $2`, [task.id, a.id]);
  await db.query(`INSERT INTO qiyas.task_ownership_history (task_id, from_user_id, to_user_id, reason_kind, actor_id, at)
     VALUES ($1, NULL, $2, 'publish', $3, $4)`, [task.id, manager, ctx.actor.userId, ctx.now]);
  await moveTask(ctx, task, 'publish', ['QC']);
  await audit(ctx, { action: 'assignment.published', entityType: 'assignment', entityId: a.id, after: { taskId: task.id, owner: manager } });
  return task.id;
}

export async function cancelAssignment(ctx: ServiceContext, assignmentId: string, reason: string): Promise<void> {
  const { db } = ctx;
  const a = await mustOne(db, 'assignment', 'SELECT status FROM qiyas.assignments WHERE id = $1 FOR UPDATE', [assignmentId]);
  let next;
  try {
    next = assignmentMachine.next(a.status, 'cancel', actorsFor(ctx.actor.grants, null), reason);
  } catch (e) {
    return fromTransition(e);
  }
  await db.query('UPDATE qiyas.assignments SET status = $2, cancel_reason = $3 WHERE id = $1', [assignmentId, next, reason]);
  const { rows } = await db.query(`SELECT * FROM qiyas.tasks WHERE assignment_id = $1 AND execution_status NOT IN ('completed', 'cancelled') FOR UPDATE`, [assignmentId]);
  for (const t of rows as TaskRow[]) {
    await moveTask(ctx, t, 'cancel', ['QC'], reason);
    await db.query('UPDATE qiyas.tasks SET cancel_reason = $2 WHERE id = $1', [t.id, reason]);
    await closeOpenPauses(db, t.id, ctx.now);
  }
  await audit(ctx, { action: 'assignment.cancelled', entityType: 'assignment', entityId: assignmentId, reason });
}

// ------------------------------------------------------------------ ownership
/**
 * Department manager assigns, self-assigns or reassigns (BR-ASG-03/04, BR-ESC-04).
 * Assignee must belong to the department, or be the manager himself.
 */
export async function assignTask(ctx: ServiceContext, taskId: string, assigneeId: string, note?: string): Promise<TaskRow> {
  const { db } = ctx;
  const task = await getTask(db, taskId, true);
  const actors = taskActors(ctx, task);
  if (!actors.includes('DM')) throw new ComplianceError('forbidden', 'Only the department manager can assign this task');
  const self = assigneeId === ctx.actor.userId;
  requirePermission(ctx, self ? 'task.self_assign' : 'task.assign', { departmentId: task.department_id });
  if (!self && !(await isDepartmentMember(db, task.department_id, assigneeId))) {
    throw new ComplianceError('validation', 'The assignee is not a member of this department'); // SoD-3
  }
  if (task.execution_status === 'completed' || task.execution_status === 'cancelled' || task.execution_status === 'submitted') {
    throw new ComplianceError('conflict', `A ${task.execution_status} task cannot be reassigned`);
  }

  const firstAssignment = task.execution_status === 'awaiting_assignment';
  const kind = self ? 'self_assign' : firstAssignment ? 'assign' : 'reassign';
  await recordOwnership(ctx, task, assigneeId, kind, note);
  await db.query(`UPDATE qiyas.tasks SET current_owner_id = $2, original_assignee_id = COALESCE(original_assignee_id, $2) WHERE id = $1`, [taskId, assigneeId]);
  const before = task.current_owner_id;
  task.current_owner_id = assigneeId;
  task.original_assignee_id = task.original_assignee_id ?? assigneeId;

  if (firstAssignment) await moveTask(ctx, task, 'assign', ['DM']);
  else if (task.execution_status === 'rework_required') await moveTask(ctx, task, 'reassign', ['DM']);
  await audit(ctx, { action: `task.${kind}`, entityType: 'task', entityId: taskId, before: { owner: before }, after: { owner: assigneeId }, reason: note });
  return task;
}

/** The current owner starts work (BR-TASK-04). */
export async function startTask(ctx: ServiceContext, taskId: string): Promise<void> {
  const task = await getTask(ctx.db, taskId, true);
  if (task.current_owner_id !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the current owner can start the task');
  await moveTask(ctx, task, 'start');
}

// ------------------------------------------------------------------ deadlines
export async function closeOpenPauses(db: Db, taskId: string, at: Date, reason?: 'clarification' | 'awaiting_review'): Promise<void> {
  await db.query(`UPDATE qiyas.deadline_pauses SET resumed_at = $2 WHERE task_id = $1 AND resumed_at IS NULL${reason ? ' AND reason = $3' : ''}`,
    reason ? [taskId, at, reason] : [taskId, at]);
}

export async function taskDeadline(ctx: Pick<ServiceContext, 'db' | 'now' | 'calendar'>, task: TaskRow): Promise<DeadlineState> {
  const { rows } = await ctx.db.query('SELECT reason, paused_at, resumed_at FROM qiyas.deadline_pauses WHERE task_id = $1', [task.id]);
  const pauses: DeadlinePause[] = rows.map((r) => ({ reason: r.reason, from: new Date(r.paused_at), to: r.resumed_at ? new Date(r.resumed_at) : null }));
  const extensionApproval = task.approved_extension_due_at
    ? await ctx.db.query(`SELECT decided_at FROM qiyas.extension_requests
         WHERE task_id = $1 AND status = 'approved' AND approved_due_at = $2
         ORDER BY decided_at DESC LIMIT 1`, [task.id, task.approved_extension_due_at])
    : { rows: [] };
  return computeDeadline({
    originalDueAt: new Date(task.original_due_at),
    approvedExtensionDueAt: task.approved_extension_due_at ? new Date(task.approved_extension_due_at) : null,
    approvedExtensionAt: extensionApproval.rows[0]?.decided_at ? new Date(extensionApproval.rows[0].decided_at) : null,
    pauses,
    now: ctx.now,
    calendar: ctx.calendar,
  });
}
