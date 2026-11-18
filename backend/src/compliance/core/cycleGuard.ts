/**
 * A closed (or archived) measurement cycle is read-only (C5, BR-BNK-01, D-C5-1..3).
 *
 * Every mutating evidence, review, submission and work-item operation calls
 * assertCycleWritable before it writes. The cycle row is read FOR SHARE: that
 * conflicts with the FOR UPDATE taken by transitionCycle, so a close and a
 * write cannot interleave. Only an administrator's reopen with a reason
 * (transitionCycle 'reopen') makes the cycle writable again; there is no bypass.
 * Migration 007 (guard_cycle_writable) enforces the same rule in the database.
 */
import { ComplianceError, Db } from './context';

export type CycleRef =
  | { cycleId: string }
  | { cycleRequirementId: string }
  | { taskId: string }
  | { assignmentId: string }
  | { linkIds: string[] };

export const WRITABLE_CYCLE_STATUSES = ['planning', 'active'] as const;

export function isCycleWritable(status: string | null | undefined): boolean {
  return (WRITABLE_CYCLE_STATUSES as readonly string[]).includes(status ?? '');
}

// The cycle id is resolved in a sub-select so only the measurement_cycles row is locked.
function cycleIdsQuery(ref: CycleRef): { where: string; params: unknown[] } {
  if ('cycleId' in ref) return { where: 'c.id = $1', params: [ref.cycleId] };
  if ('cycleRequirementId' in ref) return { where: 'c.id = (SELECT cycle_id FROM qiyas.cycle_requirements WHERE id = $1)', params: [ref.cycleRequirementId] };
  if ('taskId' in ref) return { where: 'c.id = (SELECT cycle_id FROM qiyas.tasks WHERE id = $1)', params: [ref.taskId] };
  if ('assignmentId' in ref) return { where: 'c.id = (SELECT cycle_id FROM qiyas.assignments WHERE id = $1)', params: [ref.assignmentId] };
  return {
    where: `c.id IN (SELECT cr.cycle_id FROM qiyas.evidence_links l JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
                      WHERE l.id = ANY($1::uuid[]))`,
    params: [ref.linkIds],
  };
}

/** Throws conflict unless every cycle the reference belongs to is planning or active. */
export async function assertCycleWritable(db: Db, ref: CycleRef): Promise<void> {
  const { where, params } = cycleIdsQuery(ref);
  const { rows } = await db.query(`SELECT c.id, c.status FROM qiyas.measurement_cycles c WHERE ${where} ORDER BY c.id FOR SHARE`, params);
  if (rows.length === 0) {
    if ('linkIds' in ref && ref.linkIds.length === 0) return;
    throw new ComplianceError('not_found', 'cycle not found');
  }
  const closed = rows.find((r) => !isCycleWritable(r.status));
  if (closed) {
    throw new ComplianceError('conflict', closed.status === 'archived'
      ? 'The cycle is archived and read-only'
      : 'The cycle is closed; ask the administrator to reopen it');
  }
}
