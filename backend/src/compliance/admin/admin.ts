/**
 * Administration (BR-ADM-01..07): departments, managers, members, role grants,
 * groups, deadline policies, organization settings, personal preferences.
 * Every change is audited.
 */
import { ComplianceError, ServiceContext, audit, mustOne, one, requirePermission } from '../core/context';
import { ListOf, PageRequest, listQuery } from '../api/paging';
import { RoleCode, RoleGrant, validateGrant, GrantError } from '../domain/permissions';

export async function createDepartment(ctx: ServiceContext, input: { code: string; nameAr: string; nameEn: string; parentId?: string | null }): Promise<string> {
  requirePermission(ctx, 'admin.departments');
  const d = await mustOne(ctx.db, 'department', `INSERT INTO qiyas.departments (code, name_ar, name_en, parent_id, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`, [input.code.trim(), input.nameAr.trim(), input.nameEn.trim(), input.parentId ?? null, ctx.actor.userId]);
  await audit(ctx, { action: 'admin.department_created', entityType: 'department', entityId: d.id, after: input });
  return d.id;
}

export async function updateDepartment(ctx: ServiceContext, id: string, input: { nameAr?: string; nameEn?: string; isActive?: boolean; parentId?: string | null }): Promise<void> {
  requirePermission(ctx, 'admin.departments');
  const before = await mustOne(ctx.db, 'department', 'SELECT name_ar, name_en, is_active, parent_id FROM qiyas.departments WHERE id = $1 FOR UPDATE', [id]);
  if (input.parentId === id) throw new ComplianceError('validation', 'A department cannot be its own parent');
  await ctx.db.query(`UPDATE qiyas.departments SET name_ar = COALESCE($2, name_ar), name_en = COALESCE($3, name_en),
      is_active = COALESCE($4, is_active), parent_id = CASE WHEN $6 THEN $5 ELSE parent_id END, updated_by = $7, updated_at = $8 WHERE id = $1`,
  [id, input.nameAr ?? null, input.nameEn ?? null, input.isActive ?? null, input.parentId ?? null, input.parentId !== undefined, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'admin.department_updated', entityType: 'department', entityId: id, before, after: input });
}

/** Sets the department manager (one at a time, BR-ADM-02) and gives the DM role for that department. */
export async function setDepartmentManager(ctx: ServiceContext, departmentId: string, userId: string): Promise<void> {
  requirePermission(ctx, 'admin.departments');
  const db = ctx.db;
  const current = await one(db, `SELECT id, user_id FROM qiyas.department_members WHERE department_id = $1 AND membership = 'manager' AND valid_to IS NULL FOR UPDATE`, [departmentId]);
  if (current?.user_id === userId) return;
  if (current) {
    await db.query('UPDATE qiyas.department_members SET valid_to = CURRENT_DATE WHERE id = $1', [current.id]);
    await db.query(`UPDATE qiyas.role_grants SET revoked_at = $3, revoked_by = $4 WHERE user_id = $1 AND department_id = $2 AND revoked_at IS NULL
       AND role_id = (SELECT id FROM qiyas.roles WHERE code = 'DM')`, [current.user_id, departmentId, ctx.now, ctx.actor.userId]);
  }
  await db.query(`UPDATE qiyas.department_members SET valid_to = CURRENT_DATE WHERE department_id = $1 AND user_id = $2 AND valid_to IS NULL`, [departmentId, userId]);
  await db.query(`INSERT INTO qiyas.department_members (department_id, user_id, membership, created_by) VALUES ($1, $2, 'manager', $3)`, [departmentId, userId, ctx.actor.userId]);
  await grantRole(ctx, userId, 'DM', departmentId, true);
  await audit(ctx, { action: 'admin.manager_set', entityType: 'department', entityId: departmentId, before: { manager: current?.user_id ?? null }, after: { manager: userId } });
}

export async function addDepartmentMember(ctx: ServiceContext, departmentId: string, userId: string): Promise<void> {
  requirePermission(ctx, 'admin.departments');
  const exists = await one(ctx.db, 'SELECT 1 FROM qiyas.department_members WHERE department_id = $1 AND user_id = $2 AND valid_to IS NULL', [departmentId, userId]);
  if (exists) throw new ComplianceError('conflict', 'Already a member of this department');
  await ctx.db.query(`INSERT INTO qiyas.department_members (department_id, user_id, membership, created_by) VALUES ($1, $2, 'member', $3)`, [departmentId, userId, ctx.actor.userId]);
  await grantRole(ctx, userId, 'EMP', departmentId, true);
  await audit(ctx, { action: 'admin.member_added', entityType: 'department', entityId: departmentId, after: { userId } });
}

/** Membership ends (history kept); the person's department roles there are revoked. */
export async function removeDepartmentMember(ctx: ServiceContext, departmentId: string, userId: string): Promise<void> {
  requirePermission(ctx, 'admin.departments');
  const m = await mustOne(ctx.db, 'membership', `SELECT membership FROM qiyas.department_members WHERE department_id = $1 AND user_id = $2 AND valid_to IS NULL FOR UPDATE`, [departmentId, userId]);
  if (m.membership === 'manager') throw new ComplianceError('conflict', 'Set a new manager before removing the current one');
  const open = await one(ctx.db, `SELECT count(*)::int AS n FROM qiyas.tasks WHERE department_id = $1 AND current_owner_id = $2 AND execution_status NOT IN ('completed', 'cancelled')`, [departmentId, userId]);
  if (open && open.n > 0) throw new ComplianceError('conflict', `This person still owns ${open.n} open task(s); reassign them first`);
  await ctx.db.query('UPDATE qiyas.department_members SET valid_to = CURRENT_DATE WHERE department_id = $1 AND user_id = $2 AND valid_to IS NULL', [departmentId, userId]);
  await ctx.db.query(`UPDATE qiyas.role_grants SET revoked_at = $3, revoked_by = $4 WHERE user_id = $1 AND department_id = $2 AND revoked_at IS NULL`, [userId, departmentId, ctx.now, ctx.actor.userId]);
  await audit(ctx, { action: 'admin.member_removed', entityType: 'department', entityId: departmentId, before: { userId } });
}

/** Grants a role, enforcing separation of duties (D3) before the database does. */
export async function grantRole(ctx: ServiceContext, userId: string, role: RoleCode, departmentId: string | null = null, internal = false): Promise<string | null> {
  if (!internal) requirePermission(ctx, 'admin.roles');
  const { rows } = await ctx.db.query(`SELECT r.code AS role, g.department_id FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
     WHERE g.user_id = $1 AND g.revoked_at IS NULL`, [userId]);
  const existing: RoleGrant[] = rows.map((r) => ({ role: r.role, departmentId: r.department_id }));
  try {
    validateGrant(existing, { role, departmentId });
  } catch (e) {
    if (e instanceof GrantError && e.code === 'duplicate' && internal) return null;
    if (e instanceof GrantError) throw new ComplianceError(e.code === 'duplicate' ? 'conflict' : 'validation', e.message);
    throw e;
  }
  const g = await mustOne(ctx.db, 'grant', `INSERT INTO qiyas.role_grants (role_id, user_id, department_id, granted_by, granted_at)
     SELECT id, $2, $3, $4, $5 FROM qiyas.roles WHERE code = $1 RETURNING id`, [role, userId, departmentId, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'admin.role_granted', entityType: 'user', entityId: userId, after: { role, departmentId } });
  return g.id;
}

export async function revokeGrant(ctx: ServiceContext, grantId: string, reason?: string): Promise<void> {
  requirePermission(ctx, 'admin.roles');
  const g = await mustOne(ctx.db, 'grant', `SELECT g.user_id, r.code FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id WHERE g.id = $1 AND g.revoked_at IS NULL FOR UPDATE`, [grantId]);
  if (g.user_id === ctx.actor.userId && g.code === 'ADM') throw new ComplianceError('conflict', 'You cannot remove your own administrator role');
  await ctx.db.query('UPDATE qiyas.role_grants SET revoked_at = $2, revoked_by = $3 WHERE id = $1', [grantId, ctx.now, ctx.actor.userId]);
  await audit(ctx, { action: 'admin.role_revoked', entityType: 'user', entityId: g.user_id, before: { role: g.code }, reason });
}

export async function setGroupMembers(ctx: ServiceContext, groupCode: string, userIds: string[]): Promise<void> {
  requirePermission(ctx, 'admin.groups');
  const g = await mustOne(ctx.db, 'group', 'SELECT id FROM qiyas.groups WHERE code = $1', [groupCode]);
  await ctx.db.query('DELETE FROM qiyas.group_members WHERE group_id = $1', [g.id]);
  for (const u of new Set(userIds)) await ctx.db.query('INSERT INTO qiyas.group_members (group_id, user_id) VALUES ($1, $2)', [g.id, u]);
  await audit(ctx, { action: 'admin.group_members', entityType: 'group', entityId: g.id, after: { userIds } });
}

export async function updateSlaPolicy(ctx: ServiceContext, kind: string, input: { durationBusinessDays?: number | null; reminderDays?: number[]; escalationAfterBusinessDays?: number; repeatEveryBusinessDays?: number | null; isActive?: boolean }): Promise<void> {
  requirePermission(ctx, 'admin.sla_policies');
  const before = await mustOne(ctx.db, 'policy', 'SELECT * FROM qiyas.sla_policies WHERE timer_kind = $1 FOR UPDATE', [kind]);
  await ctx.db.query(`UPDATE qiyas.sla_policies SET
      duration_business_days = CASE WHEN $2 THEN $3 ELSE duration_business_days END,
      reminder_days = COALESCE($4, reminder_days), escalation_after_business_days = COALESCE($5, escalation_after_business_days),
      repeat_every_business_days = CASE WHEN $6 THEN $7 ELSE repeat_every_business_days END,
      is_active = COALESCE($8, is_active), updated_at = $9, updated_by = $10 WHERE timer_kind = $1`,
  [kind, input.durationBusinessDays !== undefined, input.durationBusinessDays ?? null, input.reminderDays ?? null, input.escalationAfterBusinessDays ?? null,
    input.repeatEveryBusinessDays !== undefined, input.repeatEveryBusinessDays ?? null, input.isActive ?? null, ctx.now, ctx.actor.userId]);
  await audit(ctx, { action: 'admin.sla_policy_updated', entityType: 'sla_policy', entityId: kind, before, after: input });
}

export async function saveOrgSettings(ctx: ServiceContext, input: { nameAr: string; nameEn: string; defaultLanguage?: 'ar' | 'en' | 'ur' }): Promise<void> {
  requirePermission(ctx, 'admin.settings');
  await ctx.db.query(`INSERT INTO qiyas.org_settings (id, name_ar, name_en, default_language, updated_by, updated_at) VALUES (TRUE, $1, $2, COALESCE($3, 'ar'), $4, $5)
     ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
       default_language = COALESCE($3, qiyas.org_settings.default_language), updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
  [input.nameAr, input.nameEn, input.defaultLanguage ?? null, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'admin.settings_saved', entityType: 'org_settings', entityId: 'org', after: input });
}

export async function listUsers<P extends PageRequest | null = null>(ctx: ServiceContext, page: P = null as P, text?: string): Promise<ListOf<any, P>> {
  requirePermission(ctx, 'admin.users');
  return listQuery(ctx.db, `SELECT u.id, u.name, u.email,
      COALESCE((SELECT json_agg(json_build_object('id', g.id, 'role', r.code, 'departmentId', g.department_id))
        FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id WHERE g.user_id = u.id AND g.revoked_at IS NULL), '[]') AS grants
     FROM public.users u
     WHERE ($1::text IS NULL OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')`, 'name, id', [text?.trim() || null], page);
}

// ------------------------------------------------------------------ personal
export async function setMyLanguage(ctx: ServiceContext, language: 'ar' | 'en' | 'ur'): Promise<void> {
  await ctx.db.query(`INSERT INTO qiyas.user_preferences (user_id, language, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET language = EXCLUDED.language, updated_at = EXCLUDED.updated_at`, [ctx.actor.userId, language, ctx.now]);
}

export async function markNotificationsRead(ctx: ServiceContext, ids: string[] | 'all'): Promise<number> {
  const res = ids === 'all'
    ? await ctx.db.query('UPDATE qiyas.notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL RETURNING id', [ctx.actor.userId, ctx.now])
    : await ctx.db.query('UPDATE qiyas.notifications SET read_at = $3 WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL RETURNING id', [ctx.actor.userId, ids, ctx.now]);
  return res.rows.length;
}

export async function setMute(ctx: ServiceContext, eventCode: string, channel: 'in_app' | 'email', muted: boolean): Promise<void> {
  if (muted) {
    await ctx.db.query('INSERT INTO qiyas.notification_mutes (user_id, event_code, channel) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [ctx.actor.userId, eventCode, channel]);
  } else {
    await ctx.db.query('DELETE FROM qiyas.notification_mutes WHERE user_id = $1 AND event_code = $2 AND channel = $3', [ctx.actor.userId, eventCode, channel]);
  }
}
