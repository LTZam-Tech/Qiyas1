/**
 * Readiness and posting progress (BR-CMP, docs/phase1/04-state-machines.md §7).
 *
 * - A proof item is covered for a requirement when an ACCEPTED evidence link
 *   points at that requirement and proof item.
 * - A requirement is ready when all its expected proof items are covered
 *   (or, with none defined, when it has at least one accepted link).
 * - Not-applicable requirements are excluded everywhere.
 * - Uploading alone never counts (BR-CMP-01).
 */
import type { ReviewStatus, SubmissionStatus } from './stateMachines';

export interface RequirementInput {
  id: string;
  standardId: string;
  applicable: boolean;
  proofItemIds: readonly string[];
}

export interface LinkInput {
  requirementId: string;
  proofItemId: string | null;
  reviewStatus: ReviewStatus;
  /** null until the link has been accepted */
  submissionStatus: SubmissionStatus | null;
}

export interface HierarchyInput {
  /** standardId -> axisId */
  standardAxis: ReadonlyMap<string, string>;
  /** axisId -> perspectiveId */
  axisPerspective: ReadonlyMap<string, string>;
}

export type Readiness = 'not_applicable' | 'not_started' | 'in_progress' | 'ready';
export type PostingState = 'none' | 'partial' | 'full';

export interface RequirementResult {
  id: string;
  readiness: Readiness;
  coveredProofItems: number;
  expectedProofItems: number;
  acceptedLinks: number;
  postedLinks: number;
  posting: PostingState;
  /** A posted link was later revoked or superseded: needs re-posting (BR-SUB-05). */
  postedEvidenceChanged: boolean;
}

export interface Rollup {
  applicable: number;
  ready: number;
  inProgress: number;
  notStarted: number;
  notApplicable: number;
  /** ready ÷ applicable × 100, one decimal; null when nothing is applicable */
  readinessPct: number | null;
  acceptedLinks: number;
  postedLinks: number;
  /** posted ÷ accepted × 100, one decimal; null when nothing is accepted */
  postingPct: number | null;
}

export interface CompletenessResult {
  requirements: Map<string, RequirementResult>;
  standards: Map<string, Rollup>;
  axes: Map<string, Rollup>;
  perspectives: Map<string, Rollup>;
  cycle: Rollup;
}

const STARTED: readonly ReviewStatus[] = ['submitted', 'under_review', 'accepted', 'rejected', 'revoked', 'superseded'];

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10);

function emptyRollup(): Rollup {
  return { applicable: 0, ready: 0, inProgress: 0, notStarted: 0, notApplicable: 0, readinessPct: null, acceptedLinks: 0, postedLinks: 0, postingPct: null };
}

function add(r: Rollup, req: RequirementResult) {
  if (req.readiness === 'not_applicable') {
    r.notApplicable += 1;
    return;
  }
  r.applicable += 1;
  if (req.readiness === 'ready') r.ready += 1;
  else if (req.readiness === 'in_progress') r.inProgress += 1;
  else r.notStarted += 1;
  r.acceptedLinks += req.acceptedLinks;
  r.postedLinks += req.postedLinks;
}

function finish(r: Rollup): Rollup {
  return { ...r, readinessPct: pct(r.ready, r.applicable), postingPct: pct(r.postedLinks, r.acceptedLinks) };
}

export function evaluateRequirement(req: RequirementInput, links: readonly LinkInput[]): RequirementResult {
  const mine = links.filter((l) => l.requirementId === req.id);
  const accepted = mine.filter((l) => l.reviewStatus === 'accepted');
  const posted = accepted.filter((l) => l.submissionStatus === 'posted');
  const postedEvidenceChanged = mine.some((l) => (l.reviewStatus === 'revoked' || l.reviewStatus === 'superseded') && l.submissionStatus === 'posted');
  const coveredSet = new Set(accepted.map((l) => l.proofItemId).filter((p): p is string => p !== null && req.proofItemIds.includes(p)));
  const expected = req.proofItemIds.length;

  let readiness: Readiness;
  if (!req.applicable) readiness = 'not_applicable';
  else if (expected > 0 ? coveredSet.size === expected : accepted.length > 0) readiness = 'ready';
  else if (mine.some((l) => STARTED.includes(l.reviewStatus))) readiness = 'in_progress';
  else readiness = 'not_started';

  let posting: PostingState = 'none';
  if (accepted.length > 0 && posted.length === accepted.length) posting = 'full';
  else if (posted.length > 0) posting = 'partial';

  return {
    id: req.id,
    readiness,
    coveredProofItems: coveredSet.size,
    expectedProofItems: expected,
    acceptedLinks: accepted.length,
    postedLinks: posted.length,
    posting,
    postedEvidenceChanged,
  };
}

export function evaluateCompleteness(
  requirements: readonly RequirementInput[],
  links: readonly LinkInput[],
  hierarchy: HierarchyInput,
): CompletenessResult {
  const byRequirement = new Map<string, LinkInput[]>();
  for (const l of links) {
    const list = byRequirement.get(l.requirementId) ?? [];
    list.push(l);
    byRequirement.set(l.requirementId, list);
  }

  const reqResults = new Map<string, RequirementResult>();
  const standards = new Map<string, Rollup>();
  const axes = new Map<string, Rollup>();
  const perspectives = new Map<string, Rollup>();
  const cycle = emptyRollup();
  const bump = (m: Map<string, Rollup>, key: string | undefined, res: RequirementResult) => {
    if (!key) return;
    const r = m.get(key) ?? emptyRollup();
    add(r, res);
    m.set(key, r);
  };

  for (const req of requirements) {
    const res = evaluateRequirement(req, byRequirement.get(req.id) ?? []);
    reqResults.set(req.id, res);
    const axisId = hierarchy.standardAxis.get(req.standardId);
    bump(standards, req.standardId, res);
    bump(axes, axisId, res);
    bump(perspectives, axisId ? hierarchy.axisPerspective.get(axisId) : undefined, res);
    add(cycle, res);
  }

  const finishAll = (m: Map<string, Rollup>) => new Map([...m].map(([k, v]) => [k, finish(v)]));
  return {
    requirements: reqResults,
    standards: finishAll(standards),
    axes: finishAll(axes),
    perspectives: finishAll(perspectives),
    cycle: finish(cycle),
  };
}
