/**
 * Creating notifications (N-1..N-6).
 * - Mandatory notifications (✱ in the catalogue) ignore the recipient's mutes.
 * - Every notification has a dedupe key, so producers can safely run twice.
 */
import { Db, activeUserSql, one } from '../core/context';
import { RoleCode } from '../domain/permissions';
import { EVENTS, EventCode } from './catalogue';

export interface Recipient {
  userId: string | null | undefined;
  mandatory?: boolean;
}

export interface NotifyInput {
  event: EventCode;
  recipients: Recipient[];
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  /** Unique per producing occurrence; the recipient id is appended. */
  dedupeBase: string;
  /** The person who caused the event is not notified about it (unless mandatory). */
  actorId?: string | null;
  now: Date;
}

export async function notify(db: Db, input: NotifyInput): Promise<number> {
  const merged = new Map<string, boolean>();
  for (const r of input.recipients) {
    if (!r.userId) continue;
    if (r.userId === input.actorId && !r.mandatory) continue;
    merged.set(r.userId, (merged.get(r.userId) ?? false) || Boolean(r.mandatory));
  }
  // C17: deactivated or soft-deleted accounts get nothing, mandatory or not (single choke point)
  if (merged.size > 0) {
    const { rows } = await db.query(`SELECT id FROM public.users WHERE id = ANY($1::uuid[]) AND is_active AND deleted_at IS NULL`, [[...merged.keys()]]);
    const active = new Set(rows.map((r) => r.id as string));
    for (const id of [...merged.keys()]) if (!active.has(id)) merged.delete(id);
  }
  let created = 0;
  for (const [userId, mandatory] of merged) {
    const { rows } = await db.query('SELECT channel FROM qiyas.notification_mutes WHERE user_id = $1 AND event_code = $2', [userId, input.event]);
    const muted = new Set(rows.map((r) => r.channel));
    const inApp = mandatory || !muted.has('in_app');
    const email = EVENTS[input.event].email && (mandatory || !muted.has('email'));
    if (!inApp && !email) continue;
    const res = await db.query(`INSERT INTO qiyas.notifications
        (user_id, event_code, entity_type, entity_id, payload, dedupe_key, show_in_app, email_status, email_next_attempt_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [userId, input.event, input.entityType ?? null, input.entityId ?? null, JSON.stringify({ ...(input.payload ?? {}), mandatory }),
      `${input.dedupeBase}:${userId}`, inApp, email ? 'pending' : 'skipped', email ? input.now : null, input.now]);
    created += res.rows.length;
  }
  return created;
}

// ------------------------------------------------------------------ recipient lookups

export async function usersWithRole(db: Db, role: RoleCode): Promise<string[]> {
  const { rows } = await db.query(`SELECT DISTINCT COALESCE(g.user_id, gm.user_id) AS user_id
     FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
     LEFT JOIN qiyas.group_members gm ON gm.group_id = g.group_id
    WHERE r.code = $1 AND g.revoked_at IS NULL AND COALESCE(g.user_id, gm.user_id) IS NOT NULL
      AND ${activeUserSql('COALESCE(g.user_id, gm.user_id)')}`, [role]);
  return rows.map((r) => r.user_id);
}

export async function groupMembers(db: Db, groupCode: string | null | undefined): Promise<string[]> {
  if (!groupCode) return [];
  const { rows } = await db.query(`SELECT gm.user_id FROM qiyas.group_members gm JOIN qiyas.groups g ON g.id = gm.group_id WHERE g.code = $1 AND ${activeUserSql('gm.user_id')}`, [groupCode]);
  return rows.map((r) => r.user_id);
}

export interface TaskInfo {
  id: string;
  title: string;
  departmentId: string;
  ownerId: string;
  originalAssigneeId: string | null;
  /** The consultant who created the assignment: the task's responsible consultant. */
  consultantId: string;
  managerId: string | null;
}

export async function taskInfo(db: Db, taskId: string): Promise<TaskInfo | undefined> {
  const t = await one(db, `SELECT t.id, t.title, t.department_id, t.current_owner_id, t.original_assignee_id, a.assigned_by,
      (SELECT user_id FROM qiyas.department_members m WHERE m.department_id = t.department_id AND m.membership = 'manager' AND m.valid_to IS NULL
        AND ${activeUserSql('m.user_id')}) AS manager_id
     FROM qiyas.tasks t JOIN qiyas.assignments a ON a.id = t.assignment_id WHERE t.id = $1`, [taskId]);
  if (!t) return undefined;
  return {
    id: t.id, title: t.title, departmentId: t.department_id, ownerId: t.current_owner_id,
    originalAssigneeId: t.original_assignee_id, consultantId: t.assigned_by, managerId: t.manager_id,
  };
}

export const people = (ids: Array<string | null | undefined>, mandatory = false): Recipient[] => ids.map((userId) => ({ userId, mandatory }));
