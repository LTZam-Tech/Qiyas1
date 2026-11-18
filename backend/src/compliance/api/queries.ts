/**
 * Read models for the screens. Every list is filtered by the caller's
 * permission scope (own / department / all), never by the client.
 */
import { ComplianceError, ServiceContext, mustOne, one, requirePermission } from '../core/context';
import { evaluateCompleteness } from '../domain/completeness';
import { Permission, actorsFor, can } from '../domain/permissions';
import { taskMachine } from '../domain/stateMachines';
import { EventCode, Language, render } from '../notifications/catalogue';
import { TaskRow, taskDeadline } from '../work/tasks';
import { evidenceResourceFor } from '../evidence/access';
import { ListOf, PageRequest, listQuery, mapList } from './paging';

/** SQL condition limiting rows to what the caller may see for a permission. */
function scope(ctx: ServiceContext, permission: Permission, cols: { dept: string; owners: string[] }, params: unknown[]): string {
  const entries = ctx.actor.effective.get(permission) ?? [];
  if (entries.some((e) => e.scope === 'all')) return 'TRUE';
  const parts: string[] = [];
  const depts = entries.filter((e) => e.scope === 'dept' && e.departmentId).map((e) => e.departmentId);
  if (depts.length) {
    params.push(depts);
    parts.push(`${cols.dept} = ANY($${params.length}::uuid[])`);
  }
  if (entries.some((e) => e.scope === 'own' || e.scope === 'dept')) {
    params.push(ctx.actor.userId);
    parts.push(...cols.owners.map((c) => `${c} = $${params.length}`));
  }
  return parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
}

// ------------------------------------------------------------------ me
export async function me(ctx: ServiceContext) {
  const user = await mustOne(ctx.db, 'user', 'SELECT id, email, name FROM public.users WHERE id = $1', [ctx.actor.userId]);
  const pref = await one(ctx.db, 'SELECT language FROM qiyas.user_preferences WHERE user_id = $1', [ctx.actor.userId]);
  const org = await one(ctx.db, 'SELECT name_ar, name_en, default_language FROM qiyas.org_settings LIMIT 1');
  const { rows: depts } = await ctx.db.query(`SELECT d.id, d.code, d.name_ar, d.name_en, m.membership FROM qiyas.department_members m
     JOIN qiyas.departments d ON d.id = m.department_id WHERE m.user_id = $1 AND m.valid_to IS NULL`, [ctx.actor.userId]);
  const unread = await one(ctx.db, 'SELECT count(*)::int AS n FROM qiyas.notifications WHERE user_id = $1 AND read_at IS NULL AND show_in_app', [ctx.actor.userId]);
  return {
    user,
    language: pref?.language ?? org?.default_language ?? 'ar',
    organization: org ? { nameAr: org.name_ar, nameEn: org.name_en } : null,
    roles: ctx.actor.grants,
    permissions: Object.fromEntries([...ctx.actor.effective].map(([p, e]) => [p, [...new Set(e.map((x) => x.scope))]])),
    departments: depts,
    unreadNotifications: unread?.n ?? 0,
  };
}

// ------------------------------------------------------------------ cycles & readiness
export async function listCycles(ctx: ServiceContext) {
  requirePermission(ctx, 'framework.view');
  const { rows } = await ctx.db.query(`SELECT c.id, c.name, c.year, c.status, c.starts_on, c.ends_on, c.internal_target_on,
      f.id AS framework_version_id, f.document_code, f.version, b.id AS bank_id, b.status AS bank_status
     FROM qiyas.measurement_cycles c JOIN qiyas.framework_versions f ON f.id = c.framework_version_id
     JOIN qiyas.evidence_banks b ON b.cycle_id = c.id ORDER BY c.year DESC, c.name`);
  return rows;
}

/** The catalogue of a cycle with readiness at every level (dashboards, catalog screen). */
export async function cycleReadiness(ctx: ServiceContext, cycleId: string) {
  requirePermission(ctx, 'framework.view');
  const db = ctx.db;
  await mustOne(db, 'cycle', 'SELECT 1 FROM qiyas.measurement_cycles WHERE id = $1', [cycleId]);
  const { rows: reqs } = await db.query(`SELECT cr.id, cr.is_applicable, cr.not_applicable_reason, cr.readiness, r.id AS requirement_id, r.code, r.kind,
      r.text_ar, r.text_en, r.text_ur, s.id AS standard_id, s.code AS standard_code, s.title_ar AS standard_ar, s.title_en AS standard_en, s.title_ur AS standard_ur,
      a.id AS axis_id, a.code AS axis_code, a.name_ar AS axis_ar, a.name_en AS axis_en, a.name_ur AS axis_ur,
      p.id AS perspective_id, p.code AS perspective_code, p.name_ar AS perspective_ar, p.name_en AS perspective_en, p.name_ur AS perspective_ur,
      COALESCE((SELECT array_agg(rp.proof_item_id) FROM qiyas.requirement_proof_items rp WHERE rp.requirement_id = r.id), '{}') AS proof_item_ids
     FROM qiyas.cycle_requirements cr JOIN qiyas.requirements r ON r.id = cr.requirement_id
     JOIN qiyas.standards s ON s.id = r.standard_id JOIN qiyas.axes a ON a.id = s.axis_id JOIN qiyas.perspectives p ON p.id = a.perspective_id
     WHERE cr.cycle_id = $1 ORDER BY p.sort_order, a.sort_order, s.sort_order, r.sort_order`, [cycleId]);
  const { rows: links } = await db.query(`SELECT l.cycle_requirement_id, l.proof_item_id, l.review_status, l.submission_status
     FROM qiyas.evidence_links l JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id WHERE cr.cycle_id = $1`, [cycleId]);
  const result = evaluateCompleteness(
    reqs.map((r) => ({ id: r.id, standardId: r.standard_id, applicable: r.is_applicable, proofItemIds: r.proof_item_ids })),
    links.map((l) => ({ requirementId: l.cycle_requirement_id, proofItemId: l.proof_item_id, reviewStatus: l.review_status, submissionStatus: l.submission_status })),
    { standardAxis: new Map(reqs.map((r) => [r.standard_id, r.axis_id])), axisPerspective: new Map(reqs.map((r) => [r.axis_id, r.perspective_id])) },
  );
  const perspectives = new Map<string, any>();
  for (const r of reqs) {
    if (!perspectives.has(r.perspective_id)) perspectives.set(r.perspective_id, { id: r.perspective_id, code: r.perspective_code, name: { ar: r.perspective_ar, en: r.perspective_en, ur: r.perspective_ur }, rollup: result.perspectives.get(r.perspective_id), axes: new Map() });
    const p = perspectives.get(r.perspective_id);
    if (!p.axes.has(r.axis_id)) p.axes.set(r.axis_id, { id: r.axis_id, code: r.axis_code, name: { ar: r.axis_ar, en: r.axis_en, ur: r.axis_ur }, rollup: result.axes.get(r.axis_id), standards: new Map() });
    const a = p.axes.get(r.axis_id);
    if (!a.standards.has(r.standard_id)) a.standards.set(r.standard_id, { id: r.standard_id, code: r.standard_code, title: { ar: r.standard_ar, en: r.standard_en, ur: r.standard_ur }, rollup: result.standards.get(r.standard_id), requirements: [] });
    const res = result.requirements.get(r.id)!;
    a.standards.get(r.standard_id).requirements.push({
      code: r.code, kind: r.kind, text: { ar: r.text_ar, en: r.text_en, ur: r.text_ur }, applicable: r.is_applicable,
      notApplicableReason: r.not_applicable_reason, ...res,
    });
  }
  return {
    cycle: result.cycle,
    perspectives: [...perspectives.values()].map((p) => ({ ...p, axes: [...p.axes.values()].map((a: any) => ({ ...a, standards: [...a.standards.values()] })) })),
  };
}

// ------------------------------------------------------------------ tasks
const TASK_COLUMNS = `t.*, d.code AS department_code, d.name_ar AS department_ar, d.name_en AS department_en,
  o.name AS owner_name, oa.name AS original_assignee_name, a.priority, a.instructions, a.assigned_by,
  COALESCE((SELECT array_agg(s.code ORDER BY s.code) FROM qiyas.task_requirements tr JOIN qiyas.cycle_requirements cr ON cr.id = tr.cycle_requirement_id
     JOIN qiyas.requirements r ON r.id = cr.requirement_id JOIN qiyas.standards s ON s.id = r.standard_id WHERE tr.task_id = t.id), '{}') AS standard_codes`;
const TASK_FROM = `FROM qiyas.tasks t JOIN qiyas.departments d ON d.id = t.department_id JOIN qiyas.assignments a ON a.id = t.assignment_id
  JOIN public.users o ON o.id = t.current_owner_id LEFT JOIN public.users oa ON oa.id = t.original_assignee_id`;

async function withDeadline(ctx: ServiceContext, row: any) {
  const d = await taskDeadline(ctx, row as TaskRow);
  return { ...row, deadline: { original: d.originalDueAt, current: d.currentDueAt, isPaused: d.isPaused, pauseReasons: d.openPauseReasons, isOverdue: d.isOverdue } };
}

export async function listTasks<P extends PageRequest | null = null>(ctx: ServiceContext, filter: { cycleId?: string; mine?: boolean; status?: string; open?: boolean }, page: P = null as P) {
  const params: unknown[] = [];
  const where = [scope(ctx, 'task.view', { dept: 't.department_id', owners: ['t.current_owner_id', 't.original_assignee_id'] }, params)];
  if (filter.cycleId) { params.push(filter.cycleId); where.push(`t.cycle_id = $${params.length}`); }
  if (filter.mine) { params.push(ctx.actor.userId); where.push(`t.current_owner_id = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`t.execution_status = $${params.length}`); }
  if (filter.open) where.push(`t.execution_status NOT IN ('completed', 'cancelled')`);
  const list = await listQuery(ctx.db, `SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE ${where.join(' AND ')}`, 'original_due_at, title, id', params, page);
  return mapList<any, any, P>(list, (r) => withDeadline(ctx, r));
}

export async function taskDetail(ctx: ServiceContext, taskId: string) {
  const db = ctx.db;
  const params: unknown[] = [taskId];
  const vis = scope(ctx, 'task.view', { dept: 't.department_id', owners: ['t.current_owner_id', 't.original_assignee_id'] }, params);
  const task = await one(db, `SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = $1 AND ${vis}`, params);
  if (!task) throw new ComplianceError('not_found', 'task not found');
  const q = async (sql: string) => (await db.query(sql, [taskId])).rows;
  const [requirements, history, clarifications, messages, extensions, escalations, evidence] = await Promise.all([
    q(`SELECT cr.id, cr.readiness, cr.is_applicable, r.code, r.text_ar, r.text_en, r.text_ur, s.code AS standard_code, s.title_ar, s.title_en,
         COALESCE((SELECT json_agg(json_build_object('id', p.id, 'code', p.code, 'ar', p.description_ar, 'en', p.description_en, 'kind', p.expected_kind) ORDER BY p.sort_order)
           FROM qiyas.requirement_proof_items rp JOIN qiyas.proof_items p ON p.id = rp.proof_item_id WHERE rp.requirement_id = r.id), '[]') AS proof_items,
         COALESCE((SELECT json_agg(json_build_object('code', c.code, 'ar', c.text_ar, 'en', c.text_en) ORDER BY c.sort_order)
           FROM qiyas.requirements c WHERE c.parent_requirement_id = r.id), '[]') AS conditions
       FROM qiyas.task_requirements tr JOIN qiyas.cycle_requirements cr ON cr.id = tr.cycle_requirement_id
       JOIN qiyas.requirements r ON r.id = cr.requirement_id JOIN qiyas.standards s ON s.id = r.standard_id WHERE tr.task_id = $1 ORDER BY r.code`),
    q(`SELECT h.reason_kind, h.note, h.at, h.from_user_id, h.to_user_id, f.name AS from_name, tt.name AS to_name
       FROM qiyas.task_ownership_history h LEFT JOIN public.users f ON f.id = h.from_user_id JOIN public.users tt ON tt.id = h.to_user_id
       WHERE h.task_id = $1 ORDER BY h.at`),
    q(`SELECT c.*, u.name AS requester_name FROM qiyas.clarifications c JOIN public.users u ON u.id = c.requested_by WHERE c.task_id = $1 ORDER BY c.created_at`),
    q(`SELECT m.clarification_id, m.author_role, m.body, m.created_at, u.name AS author_name FROM qiyas.clarification_messages m
       JOIN qiyas.clarifications c ON c.id = m.clarification_id JOIN public.users u ON u.id = m.author_id WHERE c.task_id = $1 ORDER BY m.created_at`),
    q(`SELECT e.*, u.name AS requested_by_name FROM qiyas.extension_requests e JOIN public.users u ON u.id = e.requested_by WHERE e.task_id = $1 ORDER BY e.created_at`),
    q(`SELECT e.kind, e.reason, e.self_escalation, e.at, f.name AS from_name, t2.name AS to_name, e.from_owner_id, e.to_owner_id FROM qiyas.escalations e
       JOIN public.users f ON f.id = e.from_owner_id JOIN public.users t2 ON t2.id = e.to_owner_id WHERE e.task_id = $1 ORDER BY e.at`),
    q(`SELECT l.id, l.cycle_requirement_id, l.proof_item_id, l.review_status, l.submission_status, l.review_due_at, l.submitted_at,
         v.id AS version_id, v.version_no, v.original_filename, v.external_url, v.scan_status, v.uploaded_at, a.id AS artifact_id, a.title, u.name AS uploaded_by_name,
         v.uploaded_by, a.department_id AS artifact_department_id,
         (SELECT json_build_object('decision', d.decision, 'comment', d.comment, 'at', d.at) FROM qiyas.review_decisions d WHERE d.evidence_link_id = l.id ORDER BY d.at DESC LIMIT 1) AS last_decision
       FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id JOIN qiyas.artifacts a ON a.id = v.artifact_id
       JOIN public.users u ON u.id = v.uploaded_by WHERE l.task_id = $1 AND l.review_status <> 'withdrawn' ORDER BY l.created_at`),
  ]);
  const actors = actorsFor(ctx.actor.grants, task.department_id);
  const isOwner = task.current_owner_id === ctx.actor.userId;

  // C15: every embedded record is filtered with the same permission matrix as its own endpoints
  const allowed = (permission: Permission, ownerIds: unknown[]) =>
    can(ctx.actor.effective, ctx.actor.userId, permission, { departmentId: task.department_id, ownerIds: ownerIds.filter(Boolean) as string[] });
  const seesEscalation = (ownerIds: unknown[]) => allowed('escalation.view', [...ownerIds, task.original_assignee_id]);
  const visibleEvidence = evidence
    .filter((l) => can(ctx.actor.effective, ctx.actor.userId, 'evidence.view', evidenceResourceFor(l, task)))
    .map(({ uploaded_by: _u, artifact_department_id: _d, ...l }) => l);
  const visibleClarifications = clarifications
    .filter((c) => allowed('clarification.view', [c.requested_by, task.current_owner_id]))
    .map((c) => ({ ...c, messages: messages.filter((m) => m.clarification_id === c.id) }));
  // D-C15-2: extension requests only for the roles that take part in them
  const visibleExtensions = extensions.filter((e) => (['extension.suggest', 'extension.request', 'extension.decide'] as Permission[])
    .some((perm) => allowed(perm, [e.requested_by, task.current_owner_id])));
  const visibleEscalations = escalations
    .filter((e) => seesEscalation([e.from_owner_id, e.to_owner_id]))
    .map(({ from_owner_id: _f, to_owner_id: _t, ...e }) => e);
  // D-C15-3: escalation reasons and rework notes need escalation.view
  const visibleHistory = history.map((h) => (['escalation', 'rework_return'].includes(h.reason_kind) && !seesEscalation([h.from_user_id, h.to_user_id])
    ? { ...h, note: null } : h));
  const any = (permission: Permission) => (ctx.actor.effective.get(permission) ?? []).length > 0;
  return {
    ...(await withDeadline(ctx, task)),
    requirements,
    history: visibleHistory,
    clarifications: visibleClarifications,
    extensions: visibleExtensions,
    escalations: visibleEscalations,
    evidence: visibleEvidence,
    /** Why a list may be shorter than the task's records, for the UI. */
    visibility: {
      evidence: any('evidence.view') ? ((ctx.actor.effective.get('evidence.view') ?? []).every((e) => e.scope === 'accepted') ? 'accepted_only' : 'scoped') : 'none',
      clarifications: any('clarification.view'),
      extensions: any('extension.suggest') || any('extension.request') || any('extension.decide'),
      escalations: any('escalation.view'),
    },
    /** What the caller can do now, for the UI's buttons. */
    can: {
      assign: actors.includes('DM') && !['completed', 'cancelled', 'submitted'].includes(task.execution_status),
      start: isOwner && task.execution_status === 'assigned',
      workEvidence: (isOwner || actors.includes('QC')) && ['assigned', 'in_progress', 'rework_required', 'submitted'].includes(task.execution_status),
      askClarification: isOwner && ['awaiting_assignment', 'assigned', 'in_progress', 'rework_required'].includes(task.execution_status),
      askForMoreTime: isOwner && actors.includes('EMP'),
      requestExtension: actors.includes('DM'),
      escalate: can(ctx.actor.effective, ctx.actor.userId, 'escalation.manual') && !['draft', 'completed', 'cancelled'].includes(task.execution_status),
      cancel: taskMachine.available(task.execution_status, actors).some((t) => t.event === 'cancel'),
    },
  };
}

// ------------------------------------------------------------------ queues
export async function reviewQueue<P extends PageRequest | null = null>(ctx: ServiceContext, cycleId?: string, page: P = null as P): Promise<ListOf<any, P>> {
  requirePermission(ctx, 'review.decide');
  return listQuery(ctx.db, `SELECT l.id, l.review_status, l.review_due_at, l.submitted_at, l.claimed_by, cu.name AS claimed_by_name,
      a.title, v.id AS version_id, v.version_no, v.original_filename, v.external_url, v.uploaded_by, uu.name AS uploaded_by_name,
      r.code AS requirement_code, s.code AS standard_code, t.id AS task_id, t.title AS task_title, d.name_ar AS department_ar, d.name_en AS department_en,
      (v.uploaded_by <> $1) AS can_review
     FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id JOIN qiyas.artifacts a ON a.id = v.artifact_id
     JOIN public.users uu ON uu.id = v.uploaded_by LEFT JOIN public.users cu ON cu.id = l.claimed_by
     JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id JOIN qiyas.requirements r ON r.id = cr.requirement_id
     JOIN qiyas.standards s ON s.id = r.standard_id LEFT JOIN qiyas.tasks t ON t.id = l.task_id LEFT JOIN qiyas.departments d ON d.id = t.department_id
     WHERE l.review_status IN ('submitted', 'under_review') AND ($2::uuid IS NULL OR cr.cycle_id = $2)`,
  'review_due_at NULLS LAST, id', [ctx.actor.userId, cycleId ?? null], page);
}

export async function submissionQueue<P extends PageRequest | null = null>(ctx: ServiceContext, cycleId: string, status?: 'not_posted' | 'posted', page: P = null as P): Promise<ListOf<any, P>> {
  requirePermission(ctx, 'submission.view_queue');
  return listQuery(ctx.db, `SELECT l.id, l.submission_status, l.posted_at, l.dga_reference, pu.name AS posted_by_name,
      a.title, v.id AS version_id, v.original_filename, v.external_url, r.code AS requirement_code, s.code AS standard_code,
      s.title_ar AS standard_ar, s.title_en AS standard_en,
      (SELECT max(d.at) FROM qiyas.review_decisions d WHERE d.evidence_link_id = l.id AND d.decision = 'accept') AS accepted_at
     FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id JOIN qiyas.artifacts a ON a.id = v.artifact_id
     JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id JOIN qiyas.requirements r ON r.id = cr.requirement_id
     JOIN qiyas.standards s ON s.id = r.standard_id LEFT JOIN public.users pu ON pu.id = l.posted_by
     WHERE cr.cycle_id = $1 AND l.review_status = 'accepted' AND ($2::text IS NULL OR l.submission_status = $2)`,
  'standard_code, requirement_code, id', [cycleId, status ?? null], page);
}

export async function inbox(ctx: ServiceContext) {
  const db = ctx.db;
  const isQc = ctx.actor.grants.some((g) => g.role === 'QC');
  const managed = ctx.actor.grants.filter((g) => g.role === 'DM').map((g) => g.departmentId);
  const clarifications = (await db.query(`SELECT c.id, c.task_id, c.status, c.response_due_at, c.requester_role, u.name AS requester_name, t.title AS task_title,
      (SELECT body FROM qiyas.clarification_messages m WHERE m.clarification_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
     FROM qiyas.clarifications c JOIN qiyas.tasks t ON t.id = c.task_id JOIN public.users u ON u.id = c.requested_by
     WHERE c.status = 'open' AND ($1 OR (t.department_id = ANY($2::uuid[]) AND c.requester_role = 'EMP'))
     ORDER BY c.response_due_at`, [isQc, managed])).rows;
  const extensions = (await db.query(`SELECT e.id, e.task_id, e.level, e.status, e.requested_due_at, e.justification, e.decision_due_at, u.name AS requested_by_name, t.title AS task_title
     FROM qiyas.extension_requests e JOIN qiyas.tasks t ON t.id = e.task_id JOIN public.users u ON u.id = e.requested_by
     WHERE (e.level = 'formal' AND e.status = 'pending' AND $1) OR (e.level = 'employee_ask' AND e.status = 'asked' AND t.department_id = ANY($2::uuid[]))
     ORDER BY e.created_at`, [isQc, managed])).rows;
  return { clarifications, extensions };
}

// ------------------------------------------------------------------ notifications
export async function listNotifications<P extends PageRequest | null = null>(ctx: ServiceContext, page: P = null as P, limit = 50) {
  const pref = await one(ctx.db, 'SELECT language FROM qiyas.user_preferences WHERE user_id = $1', [ctx.actor.userId]);
  const lang: Language = pref?.language ?? 'ar';
  const inner = `SELECT id, event_code, entity_type, entity_id, payload, created_at, read_at FROM qiyas.notifications
     WHERE user_id = $1 AND show_in_app`;
  const list = (page
    ? await listQuery(ctx.db, inner, 'created_at DESC, id', [ctx.actor.userId], page)
    : (await ctx.db.query(`${inner} ORDER BY created_at DESC LIMIT $2`, [ctx.actor.userId, limit])).rows) as ListOf<any, P>;
  return mapList<any, any, P>(list, (n: any) => ({
    ...n,
    text: { ar: render(n.event_code as EventCode, 'ar', n.payload), en: render(n.event_code as EventCode, 'en', n.payload), ur: render(n.event_code as EventCode, 'ur', n.payload) },
    title: render(n.event_code as EventCode, lang, n.payload).title,
  }));
}

export async function listDepartments(ctx: ServiceContext) {
  const { rows } = await ctx.db.query(`SELECT d.id, d.code, d.name_ar, d.name_en, d.parent_id, d.is_active,
      (SELECT json_build_object('id', u.id, 'name', u.name) FROM qiyas.department_members m JOIN public.users u ON u.id = m.user_id
        WHERE m.department_id = d.id AND m.membership = 'manager' AND m.valid_to IS NULL) AS manager
     FROM qiyas.departments d ORDER BY d.code`);
  return rows;
}

export async function departmentMembers(ctx: ServiceContext, departmentId: string) {
  const ok = can(ctx.actor.effective, ctx.actor.userId, 'task.assign', { departmentId }) || can(ctx.actor.effective, ctx.actor.userId, 'admin.departments');
  if (!ok) throw new ComplianceError('forbidden', 'You cannot see the members of this department');
  const { rows } = await ctx.db.query(`SELECT u.id, u.name, u.email, m.membership FROM qiyas.department_members m JOIN public.users u ON u.id = m.user_id
     WHERE m.department_id = $1 AND m.valid_to IS NULL ORDER BY m.membership, u.name`, [departmentId]);
  return rows;
}
