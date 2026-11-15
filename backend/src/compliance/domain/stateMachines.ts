/**
 * Workflow state machines (docs/phase1/04-state-machines.md).
 *
 * Each machine lists every allowed transition, which role may trigger it,
 * and whether a written reason is required. Anything not listed is refused.
 * Contextual checks (is this user the owner? the uploader?) live in the
 * services; these machines enforce the role-level rules.
 *
 * Task execution status, evidence review status and evidence submission
 * status are separate machines on purpose (decision 8).
 */

export type Actor = 'QC' | 'DM' | 'EMP' | 'DSO' | 'EXE' | 'ADM' | 'SYSTEM';

export interface Transition<S extends string, E extends string> {
  event: E;
  from: readonly S[];
  to: S;
  actors: readonly Actor[];
  /** Minimum length of the mandatory reason; omitted = no reason needed. */
  reasonMinLength?: number;
}

export class TransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly code: 'invalid_transition' | 'actor_not_allowed' | 'reason_required',
    message: string,
  ) {
    super(message);
    this.name = 'TransitionError';
  }
}

export class StateMachine<S extends string, E extends string> {
  constructor(
    public readonly name: string,
    public readonly states: readonly S[],
    public readonly initial: S,
    public readonly terminal: readonly S[],
    private readonly transitions: readonly Transition<S, E>[],
  ) {
    for (const t of transitions) {
      for (const s of [...t.from, t.to]) {
        if (!states.includes(s)) throw new Error(`${name}: unknown state "${s}" in event "${t.event}"`);
      }
    }
  }

  /** Transitions an actor could take from a state (for building UI buttons). */
  available(from: S, actors: readonly Actor[]): Transition<S, E>[] {
    return this.transitions.filter((t) => t.from.includes(from) && t.actors.some((a) => actors.includes(a)));
  }

  /** Returns the next state or throws a TransitionError. */
  next(from: S, event: E, actors: readonly Actor[], reason?: string | null): S {
    const candidates = this.transitions.filter((t) => t.event === event && t.from.includes(from));
    if (candidates.length === 0) {
      throw new TransitionError(this.name, 'invalid_transition', `${this.name}: "${event}" is not allowed from "${from}"`);
    }
    const t = candidates.find((c) => c.actors.some((a) => actors.includes(a)));
    if (!t) {
      throw new TransitionError(this.name, 'actor_not_allowed', `${this.name}: "${event}" needs one of ${candidates[0].actors.join(', ')}`);
    }
    if (t.reasonMinLength !== undefined && (reason ?? '').trim().length < t.reasonMinLength) {
      throw new TransitionError(this.name, 'reason_required', `${this.name}: "${event}" needs a reason of at least ${t.reasonMinLength} characters`);
    }
    return t.to;
  }

  isTerminal(state: S): boolean {
    return this.terminal.includes(state);
  }
}

const REASON = 3;
/** BR-REV-02: rejection comments need at least 10 characters. */
const REJECTION_REASON = 10;

// ---------------------------------------------------------------- Task (§1)
export const TASK_STATUSES = ['draft', 'awaiting_assignment', 'assigned', 'in_progress', 'submitted', 'rework_required', 'completed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskEvent =
  | 'publish' | 'assign' | 'start' | 'submit' | 'withdraw_all' | 'link_rejected'
  | 'partially_covered' | 'all_covered' | 'reassign' | 'resume' | 'resubmit' | 'reopen' | 'cancel';

const OPEN_TASK: TaskStatus[] = ['draft', 'awaiting_assignment', 'assigned', 'in_progress', 'submitted', 'rework_required'];

export const taskMachine = new StateMachine<TaskStatus, TaskEvent>('task', TASK_STATUSES, 'draft', ['completed', 'cancelled'], [
  { event: 'publish', from: ['draft'], to: 'awaiting_assignment', actors: ['QC'] },
  { event: 'assign', from: ['awaiting_assignment'], to: 'assigned', actors: ['DM'] },
  { event: 'start', from: ['assigned'], to: 'in_progress', actors: ['DM', 'EMP', 'SYSTEM'] },
  // the consultant can submit evidence on any task like a normal employee (D3)
  { event: 'submit', from: ['in_progress'], to: 'submitted', actors: ['DM', 'EMP', 'QC', 'SYSTEM'] },
  { event: 'withdraw_all', from: ['submitted'], to: 'in_progress', actors: ['DM', 'EMP', 'QC', 'SYSTEM'] },
  { event: 'link_rejected', from: ['submitted'], to: 'rework_required', actors: ['SYSTEM'] },
  { event: 'partially_covered', from: ['submitted'], to: 'in_progress', actors: ['SYSTEM'] },
  { event: 'all_covered', from: ['submitted'], to: 'completed', actors: ['SYSTEM'] },
  { event: 'reassign', from: ['rework_required'], to: 'assigned', actors: ['DM'] },
  { event: 'resume', from: ['rework_required'], to: 'in_progress', actors: ['DM', 'EMP'] },
  { event: 'resubmit', from: ['rework_required'], to: 'submitted', actors: ['DM', 'EMP', 'QC', 'SYSTEM'] },
  { event: 'reopen', from: ['completed'], to: 'in_progress', actors: ['QC'], reasonMinLength: REASON },
  { event: 'cancel', from: OPEN_TASK, to: 'cancelled', actors: ['QC'], reasonMinLength: REASON },
]);

// ------------------------------------------------------ Evidence review (§2)
export const REVIEW_STATUSES = ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'revoked', 'superseded'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewEvent = 'submit' | 'remove' | 'withdraw' | 'claim' | 'release' | 'accept' | 'reject' | 'revoke' | 'supersede';

export const reviewMachine = new StateMachine<ReviewStatus, ReviewEvent>(
  'evidence_review', REVIEW_STATUSES, 'draft', ['rejected', 'withdrawn', 'revoked', 'superseded'], [
    { event: 'submit', from: ['draft'], to: 'submitted', actors: ['EMP', 'DM', 'QC'] },
    { event: 'remove', from: ['draft'], to: 'withdrawn', actors: ['EMP', 'DM', 'QC'] },
    { event: 'withdraw', from: ['submitted'], to: 'withdrawn', actors: ['EMP', 'DM', 'QC'] },
    { event: 'claim', from: ['submitted'], to: 'under_review', actors: ['QC'] },
    { event: 'release', from: ['under_review'], to: 'submitted', actors: ['QC', 'SYSTEM'] },
    { event: 'accept', from: ['under_review'], to: 'accepted', actors: ['QC'] },
    { event: 'reject', from: ['under_review'], to: 'rejected', actors: ['QC'], reasonMinLength: REJECTION_REASON },
    { event: 'revoke', from: ['accepted'], to: 'revoked', actors: ['QC'], reasonMinLength: REASON },
    { event: 'supersede', from: ['accepted'], to: 'superseded', actors: ['SYSTEM'] },
  ],
);

/** Review states that count towards readiness (R-4). */
export const COUNTING_REVIEW_STATUSES: readonly ReviewStatus[] = ['accepted'];

// ------------------------------------------------- DGA submission (§3)
export const SUBMISSION_STATUSES = ['not_posted', 'posted'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type SubmissionEvent = 'post' | 'unpost';

export const submissionMachine = new StateMachine<SubmissionStatus, SubmissionEvent>(
  'dga_submission', SUBMISSION_STATUSES, 'not_posted', [], [
    { event: 'post', from: ['not_posted'], to: 'posted', actors: ['DSO'] },
    { event: 'unpost', from: ['posted'], to: 'not_posted', actors: ['DSO'], reasonMinLength: REASON },
  ],
);

// -------------------------------------------------- Clarification (§4)
export const CLARIFICATION_STATUSES = ['open', 'answered', 'closed', 'cancelled'] as const;
export type ClarificationStatus = (typeof CLARIFICATION_STATUSES)[number];
export type ClarificationEvent = 'answer' | 'follow_up' | 'close' | 'cancel';

export const clarificationMachine = new StateMachine<ClarificationStatus, ClarificationEvent>(
  'clarification', CLARIFICATION_STATUSES, 'open', ['closed', 'cancelled'], [
    // the manager may answer an employee's question (D4)
    { event: 'answer', from: ['open'], to: 'answered', actors: ['QC', 'DM'] },
    { event: 'follow_up', from: ['answered'], to: 'open', actors: ['EMP', 'DM'] },
    { event: 'close', from: ['answered'], to: 'closed', actors: ['EMP', 'DM', 'SYSTEM'] },
    { event: 'cancel', from: ['open'], to: 'cancelled', actors: ['EMP', 'DM'] },
  ],
);

// ------------------------------------------------------- Extension (§5)
export const EXTENSION_ASK_STATUSES = ['asked', 'forwarded', 'declined', 'cancelled'] as const;
export type ExtensionAskStatus = (typeof EXTENSION_ASK_STATUSES)[number];
export const extensionAskMachine = new StateMachine<ExtensionAskStatus, 'forward' | 'decline' | 'cancel'>(
  'extension_ask', EXTENSION_ASK_STATUSES, 'asked', ['forwarded', 'declined', 'cancelled'], [
    { event: 'forward', from: ['asked'], to: 'forwarded', actors: ['DM'] },
    { event: 'decline', from: ['asked'], to: 'declined', actors: ['DM'], reasonMinLength: REASON },
    { event: 'cancel', from: ['asked'], to: 'cancelled', actors: ['EMP'] },
  ],
);

export const EXTENSION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type ExtensionStatus = (typeof EXTENSION_STATUSES)[number];
export const extensionMachine = new StateMachine<ExtensionStatus, 'approve' | 'reject' | 'withdraw'>(
  'extension', EXTENSION_STATUSES, 'pending', ['approved', 'rejected', 'withdrawn'], [
    { event: 'approve', from: ['pending'], to: 'approved', actors: ['QC'] },
    { event: 'reject', from: ['pending'], to: 'rejected', actors: ['QC'], reasonMinLength: REASON },
    { event: 'withdraw', from: ['pending'], to: 'withdrawn', actors: ['DM'] },
  ],
);

// ------------------------------------------------ Assignment & cycle (§6)
export const ASSIGNMENT_STATUSES = ['draft', 'published', 'closed', 'cancelled'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const assignmentMachine = new StateMachine<AssignmentStatus, 'publish' | 'close' | 'cancel'>(
  'assignment', ASSIGNMENT_STATUSES, 'draft', ['closed', 'cancelled'], [
    { event: 'publish', from: ['draft'], to: 'published', actors: ['QC'] },
    { event: 'close', from: ['published'], to: 'closed', actors: ['SYSTEM'] },
    { event: 'cancel', from: ['draft', 'published'], to: 'cancelled', actors: ['QC'], reasonMinLength: REASON },
  ],
);

export const CYCLE_STATUSES = ['planning', 'active', 'closed', 'archived'] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];
export const cycleMachine = new StateMachine<CycleStatus, 'open' | 'close' | 'reopen' | 'archive'>(
  'cycle', CYCLE_STATUSES, 'planning', ['archived'], [
    { event: 'open', from: ['planning'], to: 'active', actors: ['QC', 'ADM'] },
    { event: 'close', from: ['active'], to: 'closed', actors: ['QC', 'ADM'] },
    { event: 'reopen', from: ['closed'], to: 'active', actors: ['ADM'], reasonMinLength: REASON },
    { event: 'archive', from: ['closed'], to: 'archived', actors: ['ADM'] },
  ],
);
