/**
 * Persists requirement readiness after every review, applicability or link
 * change (BR-CMP-06), using the pure rules in domain/completeness.ts.
 */
import { Db, mustOne } from '../core/context';
import { RequirementResult, evaluateRequirement } from '../domain/completeness';

export async function recomputeRequirement(db: Db, cycleRequirementId: string): Promise<RequirementResult> {
  const cr = await mustOne(db, 'requirement', `SELECT cr.id, cr.requirement_id, cr.is_applicable, r.standard_id
     FROM qiyas.cycle_requirements cr JOIN qiyas.requirements r ON r.id = cr.requirement_id WHERE cr.id = $1`, [cycleRequirementId]);
  const proof = await db.query('SELECT proof_item_id FROM qiyas.requirement_proof_items WHERE requirement_id = $1', [cr.requirement_id]);
  const links = await db.query('SELECT proof_item_id, review_status, submission_status FROM qiyas.evidence_links WHERE cycle_requirement_id = $1', [cycleRequirementId]);
  const result = evaluateRequirement(
    { id: cr.id, standardId: cr.standard_id, applicable: cr.is_applicable, proofItemIds: proof.rows.map((r) => r.proof_item_id) },
    links.rows.map((l) => ({ requirementId: cr.id, proofItemId: l.proof_item_id, reviewStatus: l.review_status, submissionStatus: l.submission_status })),
  );
  const pct = result.readiness === 'not_applicable'
    ? null
    : result.expectedProofItems > 0
      ? Math.round((result.coveredProofItems / result.expectedProofItems) * 1000) / 10
      : result.readiness === 'ready' ? 100 : 0;
  await db.query('UPDATE qiyas.cycle_requirements SET readiness = $2, readiness_pct = $3 WHERE id = $1', [cycleRequirementId, result.readiness, pct]);
  return result;
}

/** True when every applicable requirement of the task is ready. */
export async function taskRequirementsReady(db: Db, taskId: string): Promise<boolean> {
  const row = await mustOne(db, 'task', `SELECT count(*) FILTER (WHERE cr.readiness NOT IN ('ready', 'not_applicable'))::int AS open
     FROM qiyas.task_requirements tr JOIN qiyas.cycle_requirements cr ON cr.id = tr.cycle_requirement_id WHERE tr.task_id = $1`, [taskId]);
  return row.open === 0;
}
