/**
 * Framework import and measurement cycles (BR-FW-01..07, BR-BNK-01).
 *
 * Cycles track readiness on the TOP-LEVEL requirements of each standard;
 * nested requirements are the sub-conditions shown inside them.
 */
import { ComplianceError, ServiceContext, audit, fromTransition, mustOne, requirePermission } from '../core/context';
import { actorsFor } from '../domain/permissions';
import { CycleStatus, cycleMachine } from '../domain/stateMachines';
import { ValidationIssue, validateFrameworkFile } from './frameworkFile';

export interface ImportResult {
  frameworkVersionId: string;
  issues: ValidationIssue[];
  stats: NonNullable<ReturnType<typeof validateFrameworkFile>['stats']>;
}

export async function importFramework(ctx: ServiceContext, file: unknown): Promise<ImportResult> {
  requirePermission(ctx, 'framework.import');
  const report = validateFrameworkFile(file);
  if (!report.ok || !report.framework || !report.stats) {
    const first = report.issues.find((i) => i.level === 'error');
    throw new ComplianceError('validation', `Framework file is invalid: ${first?.path} ${first?.message}`);
  }
  const f = report.framework;
  const { db } = ctx;
  const existing = await db.query('SELECT 1 FROM qiyas.framework_versions WHERE issuer = $1 AND document_code = $2 AND version = $3',
    [f.meta.issuer, f.meta.documentCode, f.meta.version]);
  if (existing.rows.length) throw new ComplianceError('conflict', `Version ${f.meta.version} of ${f.meta.documentCode} is already imported`);

  const fv = await mustOne(db, 'framework', `INSERT INTO qiyas.framework_versions
      (issuer, document_code, version, published_on, title_ar, title_en, title_ur, source_file, imported_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [f.meta.issuer, f.meta.documentCode, f.meta.version, f.meta.publishedOn, f.meta.title.ar, f.meta.title.en, f.meta.title.ur ?? null,
      JSON.stringify(file), ctx.actor.userId]);

  const ids = { perspective: new Map<string, string>(), axis: new Map<string, string>(), standard: new Map<string, string>(), requirement: new Map<string, string>(), proof: new Map<string, string>() };
  const insert = async (sql: string, params: unknown[]) => (await mustOne(db, 'row', sql, params)).id as string;

  for (const p of f.perspectives) {
    ids.perspective.set(p.code, await insert(`INSERT INTO qiyas.perspectives (framework_version_id, code, sort_order, name_ar, name_en, name_ur)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [fv.id, p.code, p.sortOrder, p.name.ar, p.name.en, p.name.ur ?? null]));
  }
  for (const a of f.axes) {
    ids.axis.set(a.code, await insert(`INSERT INTO qiyas.axes (perspective_id, code, sort_order, name_ar, name_en, name_ur)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [ids.perspective.get(a.perspectiveCode), a.code, a.sortOrder, a.name.ar, a.name.en, a.name.ur ?? null]));
  }
  for (const s of f.standards) {
    ids.standard.set(s.code, await insert(`INSERT INTO qiyas.standards (axis_id, code, sort_order, title_ar, title_en, title_ur, goal, scope, "references")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [ids.axis.get(s.axisCode), s.code, s.sortOrder, s.title.ar, s.title.en, s.title.ur ?? null,
      s.goal ? JSON.stringify(s.goal) : null, s.scope ? JSON.stringify(s.scope) : null, s.references ? JSON.stringify(s.references) : null]));
  }
  // parents are listed before their children by the flattener
  for (const r of f.requirements) {
    ids.requirement.set(r.code, await insert(`INSERT INTO qiyas.requirements (standard_id, parent_requirement_id, code, kind, sort_order, text_ar, text_en, text_ur)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [ids.standard.get(r.standardCode), r.parentCode ? ids.requirement.get(r.parentCode) : null, r.code, r.kind, r.sortOrder, r.text.ar, r.text.en, r.text.ur ?? null]));
  }
  for (const e of f.proofItems) {
    ids.proof.set(e.code, await insert(`INSERT INTO qiyas.proof_items (standard_id, code, sort_order, expected_kind, description_ar, description_en, description_ur)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ids.standard.get(e.standardCode), e.code, e.sortOrder, e.expectedKind, e.description.ar, e.description.en, e.description.ur ?? null]));
  }
  for (const l of f.requirementProofItems) {
    await db.query('INSERT INTO qiyas.requirement_proof_items (requirement_id, proof_item_id) VALUES ($1, $2)',
      [ids.requirement.get(l.requirementCode), ids.proof.get(l.proofItemCode)]);
  }

  await audit(ctx, { action: 'framework.imported', entityType: 'framework_version', entityId: fv.id, after: { ...f.meta, stats: report.stats } });
  return { frameworkVersionId: fv.id, issues: report.issues, stats: report.stats };
}

export async function activateFramework(ctx: ServiceContext, frameworkVersionId: string): Promise<void> {
  requirePermission(ctx, 'framework.import');
  const fv = await mustOne(ctx.db, 'framework', 'SELECT status FROM qiyas.framework_versions WHERE id = $1 FOR UPDATE', [frameworkVersionId]);
  if (fv.status !== 'draft') throw new ComplianceError('conflict', `Framework is already ${fv.status}`);
  await ctx.db.query(`UPDATE qiyas.framework_versions SET status = 'active' WHERE id = $1`, [frameworkVersionId]);
  await audit(ctx, { action: 'framework.activated', entityType: 'framework_version', entityId: frameworkVersionId, before: { status: 'draft' }, after: { status: 'active' } });
}

export interface NewCycle {
  frameworkVersionId: string;
  year: number;
  name: string;
  startsOn: string;
  endsOn: string;
  internalTargetOn?: string | null;
}

export async function createCycle(ctx: ServiceContext, input: NewCycle): Promise<{ cycleId: string; bankId: string; requirements: number }> {
  requirePermission(ctx, 'cycle.manage');
  const { db } = ctx;
  const fv = await mustOne(db, 'framework', 'SELECT status FROM qiyas.framework_versions WHERE id = $1', [input.frameworkVersionId]);
  if (fv.status !== 'active') throw new ComplianceError('conflict', 'A cycle can only use an active framework version');
  const cycle = await mustOne(db, 'cycle', `INSERT INTO qiyas.measurement_cycles
      (framework_version_id, year, name, starts_on, ends_on, internal_target_on, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
  [input.frameworkVersionId, input.year, input.name, input.startsOn, input.endsOn, input.internalTargetOn ?? null, ctx.actor.userId]);
  const reqs = await db.query(
    `INSERT INTO qiyas.cycle_requirements (cycle_id, requirement_id)
     SELECT $1, r.id FROM qiyas.requirements r
       JOIN qiyas.standards s ON s.id = r.standard_id JOIN qiyas.axes a ON a.id = s.axis_id JOIN qiyas.perspectives p ON p.id = a.perspective_id
      WHERE p.framework_version_id = $2 AND r.parent_requirement_id IS NULL
     RETURNING id`,
    [cycle.id, input.frameworkVersionId]);
  const bank = await mustOne(db, 'bank', `INSERT INTO qiyas.evidence_banks (cycle_id, name) VALUES ($1, $2) RETURNING id`,
    [cycle.id, `Evidence Bank – ${input.name}`]);
  await audit(ctx, { action: 'cycle.created', entityType: 'cycle', entityId: cycle.id, after: { ...input, requirements: reqs.rows.length } });
  return { cycleId: cycle.id, bankId: bank.id, requirements: reqs.rows.length };
}

export async function transitionCycle(ctx: ServiceContext, cycleId: string, event: 'open' | 'close' | 'reopen' | 'archive', reason?: string): Promise<CycleStatus> {
  const cycle = await mustOne(ctx.db, 'cycle', 'SELECT status FROM qiyas.measurement_cycles WHERE id = $1 FOR UPDATE', [cycleId]);
  let next: CycleStatus;
  try {
    next = cycleMachine.next(cycle.status, event, actorsFor(ctx.actor.grants, null), reason);
  } catch (e) {
    return fromTransition(e);
  }
  await ctx.db.query('UPDATE qiyas.measurement_cycles SET status = $2 WHERE id = $1', [cycleId, next]);
  // A closed cycle's bank becomes read-only (BR-BNK-01)
  await ctx.db.query('UPDATE qiyas.evidence_banks SET status = $2 WHERE cycle_id = $1', [cycleId, next === 'active' || next === 'planning' ? 'open' : 'read_only']);
  await audit(ctx, { action: `cycle.${event}`, entityType: 'cycle', entityId: cycleId, before: { status: cycle.status }, after: { status: next }, reason });
  return next;
}

export async function setApplicability(ctx: ServiceContext, cycleRequirementId: string, applicable: boolean, reason?: string): Promise<void> {
  requirePermission(ctx, 'applicability.manage');
  const cr = await mustOne(ctx.db, 'requirement', `SELECT cr.is_applicable, c.status FROM qiyas.cycle_requirements cr
     JOIN qiyas.measurement_cycles c ON c.id = cr.cycle_id WHERE cr.id = $1 FOR UPDATE OF cr`, [cycleRequirementId]);
  if (cr.status === 'closed' || cr.status === 'archived') throw new ComplianceError('conflict', 'The cycle is closed');
  if (!applicable && (reason ?? '').trim().length < 3) throw new ComplianceError('validation', 'A reason is required to mark a requirement not applicable');
  await ctx.db.query(`UPDATE qiyas.cycle_requirements SET is_applicable = $2, not_applicable_reason = $3,
      applicability_set_by = $4, applicability_set_at = $5,
      readiness = CASE WHEN $2 THEN (CASE WHEN readiness = 'not_applicable' THEN 'not_started' ELSE readiness END) ELSE 'not_applicable' END
     WHERE id = $1`, [cycleRequirementId, applicable, applicable ? null : reason, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'requirement.applicability', entityType: 'cycle_requirement', entityId: cycleRequirementId,
    before: { applicable: cr.is_applicable }, after: { applicable }, reason });
}
