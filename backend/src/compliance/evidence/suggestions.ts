/**
 * Link suggestions and carry-over (06-evidence-bank.md BNK-5, BNK-7).
 *
 * A folder import or a carry-over puts evidence in the bank together with the
 * requirement it probably proves. Nothing counts until the task owner (or a
 * consultant) confirms a suggestion, which creates a normal draft link that is
 * then submitted and reviewed like any other evidence.
 */
import { ComplianceError, Db, ServiceContext, audit, mustOne, one, requirePermission } from '../core/context';
import { assertCycleWritable } from '../core/cycleGuard';
import { targetsInCycle } from '../framework/crosswalk';
import { getTask, moveTask, taskActors } from '../work/tasks';
import { linkEvidence } from './evidence';
import { reuseEvidence } from './submission';

export type SuggestionSource = 'folder_import' | 'carry_over';

/** The single proof item of a requirement, when there is exactly one. */
async function onlyProofItem(db: Db, cycleRequirementId: string): Promise<string | null> {
  const { rows } = await db.query(`SELECT rp.proof_item_id FROM qiyas.requirement_proof_items rp
     JOIN qiyas.cycle_requirements cr ON cr.requirement_id = rp.requirement_id WHERE cr.id = $1`, [cycleRequirementId]);
  return rows.length === 1 ? rows[0].proof_item_id : null;
}

/** Adds open suggestions; an identical open suggestion is kept, not duplicated. Returns how many were added. */
export async function addSuggestions(ctx: ServiceContext, versionId: string, cycleRequirementIds: string[], source: SuggestionSource, detail: unknown): Promise<number> {
  let added = 0;
  for (const cr of new Set(cycleRequirementIds)) {
    const r = await ctx.db.query(`INSERT INTO qiyas.link_suggestions (artifact_version_id, cycle_requirement_id, proof_item_id, source, source_detail, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (artifact_version_id, cycle_requirement_id) WHERE status = 'open' DO NOTHING RETURNING id`,
    [versionId, cr, await onlyProofItem(ctx.db, cr), source, JSON.stringify(detail ?? null), ctx.actor.userId, ctx.now]);
    added += r.rows.length;
  }
  return added;
}

async function taskForWork(ctx: ServiceContext, taskId: string) {
  const task = await getTask(ctx.db, taskId);
  const isOwner = task.current_owner_id === ctx.actor.userId;
  if (!isOwner && !taskActors(ctx, task).includes('QC')) throw new ComplianceError('forbidden', 'Only the task owner or a consultant can use suggested evidence');
  return task;
}

/** Open suggestions for the requirements of a task. */
export async function taskSuggestions(ctx: ServiceContext, taskId: string) {
  const task = await taskForWork(ctx, taskId);
  const { rows } = await ctx.db.query(
    `SELECT sg.id, sg.source, sg.source_detail, sg.created_at, sg.cycle_requirement_id, r.code AS requirement_code,
            sg.proof_item_id, pi.code AS proof_item_code,
            v.id AS version_id, v.original_filename, v.size_bytes, v.version_no, a.id AS artifact_id, a.title,
            u.name AS suggested_by,
            EXISTS (SELECT 1 FROM qiyas.evidence_links l WHERE l.artifact_version_id = v.id AND l.cycle_requirement_id = sg.cycle_requirement_id
                      AND l.review_status NOT IN ('withdrawn', 'rejected')) AS already_linked
       FROM qiyas.link_suggestions sg
       JOIN qiyas.task_requirements tr ON tr.cycle_requirement_id = sg.cycle_requirement_id AND tr.task_id = $1
       JOIN qiyas.cycle_requirements cr ON cr.id = sg.cycle_requirement_id
       JOIN qiyas.requirements r ON r.id = cr.requirement_id
       LEFT JOIN qiyas.proof_items pi ON pi.id = sg.proof_item_id
       JOIN qiyas.artifact_versions v ON v.id = sg.artifact_version_id
       JOIN qiyas.artifacts a ON a.id = v.artifact_id
       LEFT JOIN public.users u ON u.id = sg.created_by
      WHERE sg.status = 'open' AND v.scan_status = 'clean'
      ORDER BY r.code, a.title`, [task.id]);
  return rows;
}

/** Confirms a suggestion: links the evidence to the requirement on this task as a draft. */
export async function useSuggestion(ctx: ServiceContext, suggestionId: string, taskId: string): Promise<string> {
  const sg = await mustOne(ctx.db, 'suggestion', 'SELECT * FROM qiyas.link_suggestions WHERE id = $1 FOR UPDATE', [suggestionId]);
  if (sg.status !== 'open') throw new ComplianceError('conflict', `This suggestion was already ${sg.status}`);
  await assertCycleWritable(ctx.db, { cycleRequirementId: sg.cycle_requirement_id }); // C5
  const linkId = await linkEvidence(ctx, sg.artifact_version_id, { taskId, cycleRequirementId: sg.cycle_requirement_id, proofItemId: sg.proof_item_id });
  // like an upload, the owner's first piece of evidence starts the task
  const task = await getTask(ctx.db, taskId, true);
  if (task.current_owner_id === ctx.actor.userId && task.execution_status === 'assigned') await moveTask(ctx, task, 'start', ['SYSTEM']);
  await ctx.db.query(`UPDATE qiyas.link_suggestions SET status = 'linked', evidence_link_id = $2, decided_by = $3, decided_at = $4 WHERE id = $1`,
    [suggestionId, linkId, ctx.actor.userId, ctx.now]);
  return linkId;
}

export async function dismissSuggestion(ctx: ServiceContext, suggestionId: string, taskId: string): Promise<void> {
  const task = await taskForWork(ctx, taskId);
  await assertCycleWritable(ctx.db, { taskId: task.id }); // C5
  const sg = await mustOne(ctx.db, 'suggestion', `SELECT sg.status FROM qiyas.link_suggestions sg
     JOIN qiyas.task_requirements tr ON tr.cycle_requirement_id = sg.cycle_requirement_id AND tr.task_id = $2
    WHERE sg.id = $1 FOR UPDATE OF sg`, [suggestionId, task.id]);
  if (sg.status !== 'open') throw new ComplianceError('conflict', `This suggestion was already ${sg.status}`);
  await ctx.db.query(`UPDATE qiyas.link_suggestions SET status = 'dismissed', decided_by = $2, decided_at = $3 WHERE id = $1`, [suggestionId, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'suggestion.dismissed', entityType: 'link_suggestion', entityId: suggestionId, after: { taskId } });
}

// ------------------------------------------------------------------ carry-over

interface SourceLink { versionId: string; title: string; filename: string | null; requirementId: string; requirementCode: string }

async function acceptedInCycle(db: Db, cycleId: string, versionIds?: string[]): Promise<SourceLink[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT v.id AS "versionId", a.title, v.original_filename AS filename, r.id AS "requirementId", r.code AS "requirementCode"
       FROM qiyas.evidence_links l
       JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
       JOIN qiyas.artifacts a ON a.id = v.artifact_id
       JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
       JOIN qiyas.requirements r ON r.id = cr.requirement_id
      WHERE cr.cycle_id = $1 AND l.review_status = 'accepted' AND v.scan_status = 'clean'
        AND ($2::uuid[] IS NULL OR v.id = ANY($2::uuid[]))
      ORDER BY r.code, a.title`, [cycleId, versionIds ?? null]);
  return rows;
}

async function checkCycles(ctx: ServiceContext, targetCycleId: string, sourceCycleId: string) {
  if (targetCycleId === sourceCycleId) throw new ComplianceError('validation', 'Choose an earlier cycle to carry evidence from');
  const target = await mustOne(ctx.db, 'cycle', `SELECT c.framework_version_id, b.status AS bank_status FROM qiyas.measurement_cycles c
     JOIN qiyas.evidence_banks b ON b.cycle_id = c.id WHERE c.id = $1`, [targetCycleId]);
  const source = await mustOne(ctx.db, 'cycle', 'SELECT framework_version_id FROM qiyas.measurement_cycles WHERE id = $1', [sourceCycleId]);
  if (target.bank_status !== 'open') throw new ComplianceError('conflict', 'The evidence bank of this cycle is read-only');
  if (source.framework_version_id !== target.framework_version_id) {
    const set = await one(ctx.db, 'SELECT 1 FROM qiyas.crosswalk_sets WHERE from_framework_version_id = $1 AND to_framework_version_id = $2',
      [source.framework_version_id, target.framework_version_id]);
    if (!set) throw new ComplianceError('conflict', 'The two cycles use different framework versions and no crosswalk between them is loaded');
  }
}

/**
 * What a carry-over would do: every accepted piece of evidence of the source
 * cycle with the requirements it would be suggested for in the target cycle.
 */
export async function carryOverPreview(ctx: ServiceContext, targetCycleId: string, sourceCycleId: string) {
  requirePermission(ctx, 'bank.reuse');
  await checkCycles(ctx, targetCycleId, sourceCycleId);
  const byVersion = new Map<string, { versionId: string; title: string; filename: string | null; from: string[]; to: Array<{ code: string; relation: string }>; alreadyCarried: boolean }>();
  for (const l of await acceptedInCycle(ctx.db, sourceCycleId)) {
    const item = byVersion.get(l.versionId) ?? { versionId: l.versionId, title: l.title, filename: l.filename, from: [], to: [], alreadyCarried: false };
    item.from.push(l.requirementCode);
    for (const t of await targetsInCycle(ctx.db, l.requirementId, targetCycleId)) {
      if (!item.to.some((x) => x.code === t.requirementCode)) item.to.push({ code: t.requirementCode, relation: t.relation });
    }
    byVersion.set(l.versionId, item);
  }
  const { rows: carried } = await ctx.db.query(`SELECT a.source_artifact_version_id AS id FROM qiyas.artifacts a JOIN qiyas.evidence_banks b ON b.id = a.bank_id
     WHERE b.cycle_id = $1 AND a.source_artifact_version_id = ANY($2::uuid[])`, [targetCycleId, [...byVersion.keys()]]);
  for (const c of carried) byVersion.get(c.id)!.alreadyCarried = true;
  const items = [...byVersion.values()];
  return {
    items,
    totals: { evidence: items.length, withTargets: items.filter((i) => i.to.length).length, alreadyCarried: items.filter((i) => i.alreadyCarried).length },
  };
}

/**
 * Copies accepted evidence of an earlier cycle into this cycle's bank (no file copy:
 * same stored object, BNK-3) and suggests the requirements it may prove. Evidence
 * already carried over is skipped. Acceptance never carries over (BR-BNK-04).
 */
export async function carryOver(ctx: ServiceContext, targetCycleId: string, sourceCycleId: string, versionIds?: string[]) {
  requirePermission(ctx, 'bank.reuse');
  await checkCycles(ctx, targetCycleId, sourceCycleId);
  const links = await acceptedInCycle(ctx.db, sourceCycleId, versionIds);
  const grouped = new Map<string, SourceLink[]>();
  for (const l of links) grouped.set(l.versionId, [...(grouped.get(l.versionId) ?? []), l]);

  let carried = 0; let skipped = 0; let suggestions = 0; let withoutTarget = 0;
  for (const [versionId, ls] of grouped) {
    const existing = await one(ctx.db, `SELECT a.id FROM qiyas.artifacts a JOIN qiyas.evidence_banks b ON b.id = a.bank_id
       WHERE b.cycle_id = $1 AND a.source_artifact_version_id = $2`, [targetCycleId, versionId]);
    if (existing) { skipped += 1; continue; }
    const targets = new Map<string, { code: string; relation: string; from: string }>();
    for (const l of ls) {
      for (const t of await targetsInCycle(ctx.db, l.requirementId, targetCycleId)) {
        if (!targets.has(t.cycleRequirementId)) targets.set(t.cycleRequirementId, { code: t.requirementCode, relation: t.relation, from: l.requirementCode });
      }
    }
    const copy = await reuseEvidence(ctx, versionId, targetCycleId);
    carried += 1;
    if (!targets.size) { withoutTarget += 1; continue; }
    for (const [cycleRequirementId, t] of targets) {
      suggestions += await addSuggestions(ctx, copy.versionId, [cycleRequirementId], 'carry_over',
        { sourceCycleId, sourceVersionId: versionId, fromRequirement: t.from, relation: t.relation });
    }
  }
  await audit(ctx, { action: 'bank.carried_over', entityType: 'cycle', entityId: targetCycleId, after: { sourceCycleId, carried, skipped, suggestions, withoutTarget } });
  return { carried, skipped, suggestions, withoutTarget };
}
