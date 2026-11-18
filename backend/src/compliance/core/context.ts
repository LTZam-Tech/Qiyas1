/**
 * Shared plumbing for Phase 1 services.
 *
 * Every service function receives a ServiceContext and must be called inside
 * a database transaction owned by the caller (API handler, job, or test), so
 * the business change and its audit record commit or roll back together
 * (BR-AUD-06).
 */
import type { Queryable } from '../db/migrate';
import { SAUDI_CALENDAR, WorkCalendar } from '../domain/calendar';
import { EffectivePermissions, Permission, ResourceContext, RoleCode, RoleGrant, can, resolvePermissions } from '../domain/permissions';
import { TransitionError } from '../domain/stateMachines';

export type Db = Queryable;

export interface Actor {
  userId: string;
  grants: RoleGrant[];
  effective: EffectivePermissions;
}

export interface ServiceContext {
  db: Db;
  actor: Actor;
  now: Date;
  calendar: WorkCalendar;
}

export type ErrorCode = 'forbidden' | 'not_found' | 'conflict' | 'validation';
const HTTP: Record<ErrorCode, number> = { forbidden: 403, not_found: 404, conflict: 409, validation: 422 };

export class ComplianceError extends Error {
  readonly status: number;
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'ComplianceError';
    this.status = HTTP[code];
  }
}

/** Turns a state-machine refusal into a service error. */
export function fromTransition(err: unknown): never {
  if (err instanceof TransitionError) {
    throw new ComplianceError(err.code === 'actor_not_allowed' ? 'forbidden' : err.code === 'reason_required' ? 'validation' : 'conflict', err.message);
  }
  throw err;
}

export async function one<T = any>(db: Db, text: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await db.query(text, params);
  return rows[0] as T | undefined;
}

export async function mustOne<T = any>(db: Db, what: string, text: string, params: unknown[] = []): Promise<T> {
  const row = await one<T>(db, text, params);
  if (!row) throw new ComplianceError('not_found', `${what} not found`);
  return row;
}

export function requirePermission(ctx: ServiceContext, permission: Permission, resource?: ResourceContext): void {
  if (!can(ctx.actor.effective, ctx.actor.userId, permission, resource)) {
    throw new ComplianceError('forbidden', `Missing permission ${permission}`);
  }
}

/** Active role grants of a user, directly or through a group. */
export async function loadActor(db: Db, userId: string): Promise<Actor> {
  const { rows } = await db.query(
    `SELECT r.code AS role, g.department_id
       FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
      WHERE g.revoked_at IS NULL
        AND (g.user_id = $1 OR g.group_id IN (SELECT group_id FROM qiyas.group_members WHERE user_id = $1))`,
    [userId],
  );
  const grants: RoleGrant[] = rows.map((r) => ({ role: r.role as RoleCode, departmentId: r.department_id }));
  return { userId, grants, effective: resolvePermissions(grants) };
}

export async function loadCalendar(db: Db): Promise<WorkCalendar> {
  const settings = await one(db, 'SELECT utc_offset_minutes, weekend_days FROM qiyas.org_settings LIMIT 1');
  const { rows } = await db.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, kind FROM qiyas.work_calendar`);
  return {
    utcOffsetMinutes: settings?.utc_offset_minutes ?? SAUDI_CALENDAR.utcOffsetMinutes,
    weekendDays: settings?.weekend_days ?? SAUDI_CALENDAR.weekendDays,
    holidays: rows.filter((r) => r.kind === 'holiday').map((r) => r.day),
    workingOverrides: rows.filter((r) => r.kind === 'working_override').map((r) => r.day),
  };
}

export async function buildContext(db: Db, userId: string, now = new Date()): Promise<ServiceContext> {
  return { db, actor: await loadActor(db, userId), now, calendar: await loadCalendar(db) };
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function audit(ctx: Pick<ServiceContext, 'db' | 'now'> & { actor?: Pick<Actor, 'userId'> | null }, e: AuditEntry): Promise<void> {
  await ctx.db.query(
    `INSERT INTO qiyas.audit_log (actor_id, action, entity_type, entity_id, before_value, after_value, reason, at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ctx.actor?.userId ?? null, e.action, e.entityType, e.entityId,
      e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after),
      e.reason ?? null, ctx.now],
  );
}

/**
 * C17: SQL predicate, true when the public.users row with id `userIdSql` is an active account
 * (is_active and not soft-deleted). Background recipients, assignment and escalation targets use it.
 */
export const activeUserSql = (userIdSql: string) =>
  `EXISTS (SELECT 1 FROM public.users au WHERE au.id = ${userIdSql} AND au.is_active AND au.deleted_at IS NULL)`;

/** Current department manager with an active account, or undefined when the department has none (C17). */
export async function departmentManager(db: Db, departmentId: string): Promise<string | undefined> {
  const row = await one(db, `SELECT user_id FROM qiyas.department_members
     WHERE department_id = $1 AND membership = 'manager' AND valid_to IS NULL AND ${activeUserSql('user_id')}`, [departmentId]);
  return row?.user_id;
}

/**
 * With `lock`, the current membership row is read FOR SHARE (SoD-3): a concurrent
 * removeDepartmentMember (FOR UPDATE on the same row) waits for this transaction, then sees its
 * result; or this read waits for the removal and then finds no current membership.
 * A deactivated or deleted account is never a member here (C17).
 */
export async function isDepartmentMember(db: Db, departmentId: string, userId: string, opts: { lock?: boolean } = {}): Promise<boolean> {
  const row = await one(db, `SELECT 1 FROM qiyas.department_members
     WHERE department_id = $1 AND user_id = $2 AND valid_to IS NULL AND ${activeUserSql('user_id')}${opts.lock ? ' FOR SHARE' : ''}`, [departmentId, userId]);
  return Boolean(row);
}
