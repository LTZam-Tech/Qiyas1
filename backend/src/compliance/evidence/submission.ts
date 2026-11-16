/**
 * DGA submission preparation (BR-SUB-01..06) and evidence-bank reuse (BR-BNK-01..05).
 *
 * Phase 1 records only whether accepted evidence is posted on the DGA portal;
 * DGA's own verdict is out of scope.
 */
import { ComplianceError, ServiceContext, audit, fromTransition, mustOne, requirePermission } from '../core/context';
import { ListOf, PageRequest, listQuery } from '../api/paging';
import { submissionMachine } from '../domain/stateMachines';
import { recomputeRequirement } from './readiness';

function officerActors(ctx: ServiceContext) {
  return ctx.actor.grants.some((g) => g.role === 'DSO') ? (['DSO'] as const) : ([] as const);
}

export async function markPosted(ctx: ServiceContext, linkIds: string[], details: { dgaReference?: string } = {}): Promise<number> {
  requirePermission(ctx, 'submission.mark_posted');
  if (linkIds.length === 0) throw new ComplianceError('validation', 'Choose the evidence that was posted');
  const { rows } = await ctx.db.query('SELECT id, review_status, submission_status, cycle_requirement_id FROM qiyas.evidence_links WHERE id = ANY($1::uuid[]) FOR UPDATE', [linkIds]);
  if (rows.length !== new Set(linkIds).size) throw new ComplianceError('not_found', 'Some evidence was not found');
  for (const l of rows) {
    if (l.review_status !== 'accepted') throw new ComplianceError('conflict', 'Only accepted evidence can be marked as posted'); // SoD-4
    let next;
    try {
      next = submissionMachine.next(l.submission_status, 'post', [...officerActors(ctx)]);
    } catch (e) {
      return fromTransition(e);
    }
    await ctx.db.query('UPDATE qiyas.evidence_links SET submission_status = $2, posted_at = $3, posted_by = $4, dga_reference = $5 WHERE id = $1',
      [l.id, next, ctx.now, ctx.actor.userId, details.dgaReference ?? null]);
    await ctx.db.query(`INSERT INTO qiyas.submission_events (evidence_link_id, from_status, to_status, dga_reference, actor_id, at)
       VALUES ($1, $2, $3, $4, $5, $6)`, [l.id, l.submission_status, next, details.dgaReference ?? null, ctx.actor.userId, ctx.now]);
    await recomputeRequirement(ctx.db, l.cycle_requirement_id);
  }
  await audit(ctx, { action: 'submission.posted', entityType: 'evidence_link', entityId: linkIds.join(','), after: { count: rows.length, ...details } });
  return rows.length;
}

/** BR-SUB-04: reverting needs a reason; the history keeps both events. */
export async function markNotPosted(ctx: ServiceContext, linkId: string, reason: string): Promise<void> {
  requirePermission(ctx, 'submission.mark_not_posted');
  const l = await mustOne(ctx.db, 'evidence', 'SELECT submission_status, cycle_requirement_id FROM qiyas.evidence_links WHERE id = $1 FOR UPDATE', [linkId]);
  let next;
  try {
    next = submissionMachine.next(l.submission_status, 'unpost', [...officerActors(ctx)], reason);
  } catch (e) {
    return fromTransition(e);
  }
  await ctx.db.query('UPDATE qiyas.evidence_links SET submission_status = $2, posted_at = NULL, posted_by = NULL WHERE id = $1', [linkId, next]);
  await ctx.db.query(`INSERT INTO qiyas.submission_events (evidence_link_id, from_status, to_status, reason, actor_id, at) VALUES ($1, 'posted', $2, $3, $4, $5)`,
    [linkId, next, reason, ctx.actor.userId, ctx.now]);
  await recomputeRequirement(ctx.db, l.cycle_requirement_id);
  await audit(ctx, { action: 'submission.unposted', entityType: 'evidence_link', entityId: linkId, reason });
}

/** BR-SUB-02: an ordered package of accepted evidence for the DGA portal. */
export async function createPackage(ctx: ServiceContext, cycleId: string, title: string, linkIds: string[]): Promise<string> {
  requirePermission(ctx, 'submission.package');
  if (!title?.trim() || linkIds.length === 0) throw new ComplianceError('validation', 'A package needs a title and at least one item');
  const { rows } = await ctx.db.query(`SELECT l.id, l.review_status FROM qiyas.evidence_links l
     JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id WHERE l.id = ANY($1::uuid[]) AND cr.cycle_id = $2`, [linkIds, cycleId]);
  if (rows.length !== new Set(linkIds).size) throw new ComplianceError('validation', 'Some evidence is not part of this cycle');
  if (rows.some((r) => r.review_status !== 'accepted')) throw new ComplianceError('conflict', 'Packages contain accepted evidence only');
  const p = await mustOne(ctx.db, 'package', 'INSERT INTO qiyas.submission_packages (cycle_id, prepared_by, title, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [cycleId, ctx.actor.userId, title.trim(), ctx.now]);
  let order = 1;
  for (const id of linkIds) {
    await ctx.db.query('INSERT INTO qiyas.submission_package_items (package_id, evidence_link_id, sort_order) VALUES ($1, $2, $3)', [p.id, id, order++]);
  }
  await audit(ctx, { action: 'submission.package_created', entityType: 'submission_package', entityId: p.id, after: { title, items: linkIds.length } });
  return p.id;
}

// ------------------------------------------------------------------ evidence banks

export interface BankSearch {
  cycleId: string;
  text?: string;
  standardCode?: string;
  acceptedOnly?: boolean;
}

/** BR-BNK-02: search a cycle's bank (historical banks are read-only but searchable). */
export interface BankHit { versionId: string; artifactId: string; title: string; versionNo: number; standardCode: string | null; reviewStatus: string | null }

export async function searchBank<P extends PageRequest | null = null>(ctx: ServiceContext, q: BankSearch, page: P = null as P): Promise<ListOf<BankHit, P>> {
  requirePermission(ctx, 'bank.search_history');
  return listQuery<BankHit, P>(ctx.db,
    `SELECT DISTINCT ON (v.id, s.code) v.id AS "versionId", a.id AS "artifactId", a.title, v.version_no AS "versionNo",
            s.code AS "standardCode", l.review_status AS "reviewStatus"
       FROM qiyas.artifact_versions v
       JOIN qiyas.artifacts a ON a.id = v.artifact_id
       JOIN qiyas.evidence_banks b ON b.id = a.bank_id
       LEFT JOIN qiyas.evidence_links l ON l.artifact_version_id = v.id
       LEFT JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
       LEFT JOIN qiyas.requirements r ON r.id = cr.requirement_id
       LEFT JOIN qiyas.standards s ON s.id = r.standard_id
      WHERE b.cycle_id = $1 AND v.scan_status = 'clean'
        AND ($2::text IS NULL OR a.title ILIKE '%' || $2 || '%' OR v.original_filename ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR s.code = $3)
        AND (NOT $4 OR l.review_status = 'accepted')
      ORDER BY v.id, s.code`,
    'title, "versionNo", "standardCode" NULLS LAST, "versionId"', [q.cycleId, q.text ?? null, q.standardCode ?? null, q.acceptedOnly ?? false], page);
}

/**
 * BR-BNK-03/04/05: reuse a historical version as a starting point in another cycle.
 * Creates a new artifact in the target bank pointing at the same stored object,
 * recording its source. It starts unlinked and must be reviewed again.
 */
export async function reuseEvidence(ctx: ServiceContext, sourceVersionId: string, targetCycleId: string, title?: string): Promise<{ artifactId: string; versionId: string }> {
  requirePermission(ctx, 'bank.reuse');
  const { db } = ctx;
  const src = await mustOne(db, 'source evidence', `SELECT v.*, a.title, a.kind, a.department_id, b.cycle_id FROM qiyas.artifact_versions v
     JOIN qiyas.artifacts a ON a.id = v.artifact_id JOIN qiyas.evidence_banks b ON b.id = a.bank_id WHERE v.id = $1`, [sourceVersionId]);
  if (src.cycle_id === targetCycleId) throw new ComplianceError('validation', 'Reuse copies evidence into a different cycle');
  if (src.scan_status !== 'clean') throw new ComplianceError('conflict', 'Only clean evidence can be reused');
  const bank = await mustOne(db, 'target bank', 'SELECT id, status FROM qiyas.evidence_banks WHERE cycle_id = $1', [targetCycleId]);
  if (bank.status !== 'open') throw new ComplianceError('conflict', 'The target evidence bank is read-only');

  const a = await mustOne(db, 'artifact', `INSERT INTO qiyas.artifacts (bank_id, owner_id, department_id, title, kind, source_artifact_version_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [bank.id, ctx.actor.userId, src.department_id, title ?? src.title, src.kind, sourceVersionId, ctx.now]);
  const v = await mustOne(db, 'version', `INSERT INTO qiyas.artifact_versions
      (artifact_id, version_no, storage_key, sha256, size_bytes, mime_type, original_filename, external_url, scan_status,
       document_date, approving_authority, page_references, uploaded_by, uploaded_at)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, 'clean', $8, $9, $10, $11, $12) RETURNING id`,
  [a.id, src.storage_key, src.sha256, src.size_bytes, src.mime_type, src.original_filename, src.external_url,
    src.document_date, src.approving_authority, src.page_references, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'bank.reused', entityType: 'artifact', entityId: a.id, after: { sourceVersionId, sourceCycleId: src.cycle_id, targetCycleId } });
  return { artifactId: a.id, versionId: v.id };
}
