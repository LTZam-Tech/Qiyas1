/**
 * Consultant review (BR-REV-01..09, D5, D9).
 *
 * Queue items are claimed by one consultant at a time; nobody reviews what
 * they uploaded. Each evidence link is decided separately. After a decision
 * the requirement's readiness is recalculated and the task follows:
 *   any rejection → rework required, back to the department manager, deadline resumes
 *   nothing left to review → completed when all its requirements are ready, else back to work
 */
import { ComplianceError, ServiceContext, audit, departmentManager, fromTransition, mustOne, requirePermission } from '../core/context';
import { assertCycleWritable } from '../core/cycleGuard';
import { ReviewStatus, reviewMachine } from '../domain/stateMachines';
import { closeOpenPauses, getTask, moveTask } from '../work/tasks';
import { hasPendingReview } from './evidence';
import { recomputeRequirement, taskRequirementsReady } from './readiness';

/** Loads a link for a review action; every caller writes, so a closed cycle refuses here (C5, D-C5-1). */
async function loadLink(ctx: ServiceContext, linkId: string) {
  const link = await mustOne(ctx.db, 'evidence', `SELECT l.*, v.uploaded_by, v.scan_status, v.artifact_id, v.version_no
     FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id WHERE l.id = $1 FOR UPDATE OF l`, [linkId]);
  await assertCycleWritable(ctx.db, { linkIds: [linkId] });
  return link;
}

function consultantOnly(ctx: ServiceContext) {
  requirePermission(ctx, 'review.decide');
}

async function transition(ctx: ServiceContext, linkId: string, from: ReviewStatus, event: Parameters<typeof reviewMachine.next>[1], reason?: string): Promise<ReviewStatus> {
  try {
    const next = reviewMachine.next(from, event, ['QC'], reason);
    // Accepted evidence always enters the DGA queue as "not posted", in the same statement (BR-REV-06).
    await ctx.db.query(`UPDATE qiyas.evidence_links SET review_status = $2,
        submission_status = CASE WHEN $2 = 'accepted' THEN COALESCE(submission_status, 'not_posted') ELSE submission_status END
       WHERE id = $1`, [linkId, next]);
    return next;
  } catch (e) {
    return fromTransition(e);
  }
}

/** A consultant takes a submitted item from the shared queue. */
export async function claimEvidence(ctx: ServiceContext, linkId: string): Promise<void> {
  consultantOnly(ctx);
  const link = await loadLink(ctx, linkId);
  if (link.uploaded_by === ctx.actor.userId) throw new ComplianceError('forbidden', 'You uploaded this evidence; another consultant must review it'); // D9
  if (link.scan_status !== 'clean') throw new ComplianceError('conflict', 'The file has not passed the virus scan');
  if (link.review_status === 'under_review') throw new ComplianceError('conflict', 'Another consultant is already reviewing this evidence');
  await transition(ctx, linkId, link.review_status, 'claim');
  await ctx.db.query('UPDATE qiyas.evidence_links SET claimed_by = $2, claimed_at = $3 WHERE id = $1', [linkId, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'review.claimed', entityType: 'evidence_link', entityId: linkId });
}

export async function releaseEvidence(ctx: ServiceContext, linkId: string): Promise<void> {
  const link = await loadLink(ctx, linkId);
  if (link.claimed_by !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Only the consultant reviewing it can release it');
  await transition(ctx, linkId, link.review_status, 'release');
  await ctx.db.query('UPDATE qiyas.evidence_links SET claimed_by = NULL, claimed_at = NULL WHERE id = $1', [linkId]);
  await audit(ctx, { action: 'review.released', entityType: 'evidence_link', entityId: linkId });
}

async function decide(ctx: ServiceContext, linkId: string, decision: 'accept' | 'reject', comment?: string, checklist?: unknown) {
  consultantOnly(ctx);
  const link = await loadLink(ctx, linkId);
  if (link.claimed_by !== ctx.actor.userId) throw new ComplianceError('forbidden', 'Claim the evidence before deciding on it');
  if (link.uploaded_by === ctx.actor.userId) throw new ComplianceError('forbidden', 'Nobody reviews evidence they uploaded');
  const next = await transition(ctx, linkId, link.review_status, decision, comment);
  await ctx.db.query(`INSERT INTO qiyas.review_decisions (evidence_link_id, reviewer_id, decision, comment, checklist_results, at)
     VALUES ($1, $2, $3, $4, $5, $6)`, [linkId, ctx.actor.userId, decision, comment ?? null, checklist ? JSON.stringify(checklist) : null, ctx.now]);
  return { link, next };
}

/** BR-REV-09: a newer accepted version supersedes older accepted versions of the same artifact for the same requirement. */
async function supersedeOlder(ctx: ServiceContext, link: any) {
  const { rows } = await ctx.db.query(`SELECT l.id FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
     WHERE v.artifact_id = $1 AND v.version_no < $2 AND l.cycle_requirement_id = $3
       AND l.proof_item_id IS NOT DISTINCT FROM $4 AND l.review_status = 'accepted' FOR UPDATE OF l`,
  [link.artifact_id, link.version_no, link.cycle_requirement_id, link.proof_item_id]);
  for (const r of rows) {
    await ctx.db.query(`UPDATE qiyas.evidence_links SET review_status = $2 WHERE id = $1`, [r.id, reviewMachine.next('accepted', 'supersede', ['SYSTEM'])]);
    await audit(ctx, { action: 'review.superseded', entityType: 'evidence_link', entityId: r.id, after: { by: link.id } });
  }
}

export async function acceptEvidence(ctx: ServiceContext, linkId: string, comment?: string, checklist?: unknown): Promise<void> {
  const { link } = await decide(ctx, linkId, 'accept', comment, checklist);
  await supersedeOlder(ctx, link);
  await recomputeRequirement(ctx.db, link.cycle_requirement_id);
  await audit(ctx, { action: 'review.accepted', entityType: 'evidence_link', entityId: linkId, reason: comment });
  if (link.task_id) await syncTask(ctx, link.task_id, false);
}

export async function rejectEvidence(ctx: ServiceContext, linkId: string, comment: string): Promise<void> {
  const { link } = await decide(ctx, linkId, 'reject', comment);
  await recomputeRequirement(ctx.db, link.cycle_requirement_id);
  await audit(ctx, { action: 'review.rejected', entityType: 'evidence_link', entityId: linkId, reason: comment });
  if (link.task_id) await syncTask(ctx, link.task_id, true);
}

/** BR-REV-08: a consultant withdraws an earlier acceptance with a reason. */
export async function revokeEvidence(ctx: ServiceContext, linkId: string, reason: string): Promise<void> {
  consultantOnly(ctx);
  const link = await loadLink(ctx, linkId);
  if (link.uploaded_by === ctx.actor.userId) throw new ComplianceError('forbidden', 'Nobody reviews evidence they uploaded');
  await transition(ctx, linkId, link.review_status, 'revoke', reason);
  await ctx.db.query(`INSERT INTO qiyas.review_decisions (evidence_link_id, reviewer_id, decision, comment, at) VALUES ($1, $2, 'revoke', $3, $4)`,
    [linkId, ctx.actor.userId, reason, ctx.now]);
  await recomputeRequirement(ctx.db, link.cycle_requirement_id);
  await audit(ctx, { action: 'review.revoked', entityType: 'evidence_link', entityId: linkId, reason });
}

/** Moves the task after a decision (docs/phase1/04-state-machines.md §1). */
async function syncTask(ctx: ServiceContext, taskId: string, rejected: boolean): Promise<void> {
  const { db } = ctx;
  const task = await getTask(db, taskId, true);
  if (task.execution_status !== 'submitted') return;

  if (rejected) {
    await moveTask(ctx, task, 'link_rejected', ['SYSTEM']);
    const manager = await departmentManager(db, task.department_id);
    if (manager && manager !== task.current_owner_id) {
      await db.query(`INSERT INTO qiyas.task_ownership_history (task_id, from_user_id, to_user_id, reason_kind, note, actor_id, at)
         VALUES ($1, $2, $3, 'rework_return', 'Evidence rejected', $4, $5)`, [task.id, task.current_owner_id, manager, ctx.actor.userId, ctx.now]);
      await db.query('UPDATE qiyas.tasks SET current_owner_id = $2 WHERE id = $1', [task.id, manager]);
    }
    await closeOpenPauses(db, task.id, ctx.now, 'awaiting_review'); // D5: the same deadline resumes
    return;
  }

  if (await hasPendingReview(db, task.id)) return;
  await moveTask(ctx, task, (await taskRequirementsReady(db, task.id)) ? 'all_covered' : 'partially_covered', ['SYSTEM']);
  await closeOpenPauses(db, task.id, ctx.now, 'awaiting_review');
}
