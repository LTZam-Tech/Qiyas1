/**
 * Task deadline engine (BR-EXT-04, BR-CLR-06, D1, D5).
 *
 * current due = (latest approved extension date, else the original date)
 *               + working time spent paused (open clarification, evidence awaiting review)
 * The original deadline is never modified.
 */
import { WorkCalendar, addBusinessMs, businessMsBetween } from './calendar';

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
  pauses: DeadlinePause[];
  now: Date;
  calendar: WorkCalendar;
}

export interface DeadlineState {
  originalDueAt: Date;
  /** Due date before pauses: original or approved extension. */
  baseDueAt: Date;
  /** Effective due date including working time spent paused so far. */
  currentDueAt: Date;
  pausedBusinessMs: number;
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
  const { originalDueAt, approvedExtensionDueAt, pauses, now, calendar } = input;
  const baseDueAt = approvedExtensionDueAt ?? originalDueAt;
  const pausedBusinessMs = mergedIntervals(pauses, now).reduce(
    (sum, [s, e]) => sum + businessMsBetween(new Date(s), new Date(e), calendar),
    0,
  );
  const currentDueAt = addBusinessMs(baseDueAt, pausedBusinessMs, calendar);
  const openPauseReasons = pauses.filter((p) => p.to === null && p.from.getTime() <= now.getTime()).map((p) => p.reason);
  const isPaused = openPauseReasons.length > 0;
  return {
    originalDueAt,
    baseDueAt,
    currentDueAt,
    pausedBusinessMs,
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
