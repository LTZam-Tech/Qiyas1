/**
 * Task deadline engine (BR-EXT-04, BR-CLR-06, D1, D5).
 *
 * current due = (latest approved extension date, else the original date)
 *               + working days spent paused (open clarification, evidence awaiting review),
 *                 rounded to the nearest whole working day so deadlines stay end-of-day dates
 * The original deadline is never modified.
 */
import { WorkCalendar, addBusinessDays, businessMsBetween } from './calendar';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PauseReason = 'clarification' | 'awaiting_review';

export interface DeadlinePause {
  reason: PauseReason;
  from: Date;
  /** null while the pause is still open */
  to: Date | null;
}

export interface DeadlineInput {
  originalDueAt: Date;
  /** Date set by the latest approved extension, if any. */
  approvedExtensionDueAt?: Date | null;
  /** Approval instant for the active extension; only pauses after this instant count. */
  approvedExtensionAt?: Date | null;
  pauses: DeadlinePause[];
  now: Date;
  calendar: WorkCalendar;
}

export interface DeadlineState {
  originalDueAt: Date;
  /** Due date before pauses: original or approved extension. */
  baseDueAt: Date;
  /** Effective due date including working days spent paused so far. */
  currentDueAt: Date;
  pausedBusinessMs: number;
  /** Paused time counted against the deadline, in whole working days. */
  pausedBusinessDays: number;
  isPaused: boolean;
  openPauseReasons: PauseReason[];
  isOverdue: boolean;
}

/**
 * Merges overlapping pauses so time paused for two reasons at once
 * (e.g. a clarification raised while evidence is under review) counts once.
 */
function mergedIntervals(pauses: DeadlinePause[], now: Date): Array<[number, number]> {
  const intervals = pauses
    .map((p) => [p.from.getTime(), (p.to ?? now).getTime()] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of intervals) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export function computeDeadline(input: DeadlineInput): DeadlineState {
  const { originalDueAt, approvedExtensionDueAt, approvedExtensionAt, pauses, now, calendar } = input;
  const baseDueAt = approvedExtensionDueAt ?? originalDueAt;
  // Time paused before an extension is approved has already elapsed against the
  // old deadline. Do not add it again to the newly approved deadline.
  const eligiblePauses = approvedExtensionDueAt && approvedExtensionAt
    ? pauses.map((p) => ({ ...p, from: new Date(Math.max(p.from.getTime(), approvedExtensionAt.getTime())) }))
    : pauses;
  const pausedBusinessMs = mergedIntervals(eligiblePauses, now).reduce(
    (sum, [s, e]) => sum + businessMsBetween(new Date(s), new Date(e), calendar),
    0,
  );
  // A pause shorter than half a working day does not move a date-based deadline.
  const pausedBusinessDays = Math.round(pausedBusinessMs / DAY_MS);
  const currentDueAt = pausedBusinessDays > 0 ? addBusinessDays(baseDueAt, pausedBusinessDays, calendar) : baseDueAt;
  const openPauseReasons = pauses.filter((p) => p.to === null && p.from.getTime() <= now.getTime()).map((p) => p.reason);
  const isPaused = openPauseReasons.length > 0;
  return {
    originalDueAt,
    baseDueAt,
    currentDueAt,
    pausedBusinessMs,
    pausedBusinessDays,
    isPaused,
    openPauseReasons: [...new Set(openPauseReasons)],
    // No reminders, overdue or automatic escalation while paused (BR-ESC-02).
    isOverdue: !isPaused && now.getTime() > currentDueAt.getTime(),
  };
}

/** True when automatic escalation should fire (BR-ESC-02): overdue past the configured threshold. */
export function isAutoEscalationDue(
  state: DeadlineState,
  now: Date,
  thresholdBusinessDays: number,
  calendar: WorkCalendar,
): boolean {
  if (state.isPaused || !state.isOverdue) return false;
  if (thresholdBusinessDays <= 0) return true;
  const overdueMs = businessMsBetween(state.currentDueAt, now, calendar);
  return overdueMs >= thresholdBusinessDays * 24 * 60 * 60 * 1000;
}
