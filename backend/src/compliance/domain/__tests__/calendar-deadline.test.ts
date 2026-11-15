import {
  SAUDI_CALENDAR,
  WorkCalendar,
  addBusinessDays,
  addBusinessMs,
  businessMsBetween,
  endOfLocalDay,
  isWorkingDay,
  localDateKey,
} from '../calendar';
import { computeDeadline, isAutoEscalationDue } from '../deadline';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Riyadh local time → UTC instant. */
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min) - 180 * 60_000);

const cal: WorkCalendar = { ...SAUDI_CALENDAR, holidays: [] };

describe('work calendar (Saudi: Friday–Saturday weekend, Riyadh time)', () => {
  it('knows the weekend and holidays', () => {
    expect(isWorkingDay('2026-11-15', cal)).toBe(true); // Sunday
    expect(isWorkingDay('2026-11-20', cal)).toBe(false); // Friday
    expect(isWorkingDay('2026-11-21', cal)).toBe(false); // Saturday
    expect(isWorkingDay('2026-11-17', { ...cal, holidays: ['2026-11-17'] })).toBe(false);
    expect(isWorkingDay('2026-11-21', { ...cal, workingOverrides: ['2026-11-21'] })).toBe(true);
  });

  it('uses local dates, not UTC dates', () => {
    // 22:30 UTC on the 15th is 01:30 on the 16th in Riyadh
    expect(localDateKey(new Date(Date.UTC(2026, 10, 15, 22, 30)), cal)).toBe('2026-11-16');
  });

  it('adds business days skipping the weekend, ending at local end of day', () => {
    const due = addBusinessDays(local(2026, 11, 15, 10), 5, cal);
    expect(due.toISOString()).toBe(endOfLocalDay('2026-11-22', cal).toISOString());
    expect(due.toISOString()).toBe('2026-11-22T20:59:59.999Z');
  });

  it('skips public holidays', () => {
    const due = addBusinessDays(local(2026, 11, 15, 10), 5, { ...cal, holidays: ['2026-11-17'] });
    expect(localDateKey(due, cal)).toBe('2026-11-23');
  });

  it('0 business days on a weekend lands on the next working day', () => {
    expect(localDateKey(addBusinessDays(local(2026, 11, 20, 9), 0, cal), cal)).toBe('2026-11-22');
  });

  it('rejects negative or fractional day counts', () => {
    expect(() => addBusinessDays(local(2026, 11, 15), -1, cal)).toThrow(RangeError);
    expect(() => addBusinessDays(local(2026, 11, 15), 1.5, cal)).toThrow(RangeError);
  });

  it('measures working time only', () => {
    // Thursday noon → Sunday noon: 12h Thursday + 12h Sunday
    expect(businessMsBetween(local(2026, 11, 19, 12), local(2026, 11, 22, 12), cal)).toBe(24 * HOUR);
    expect(businessMsBetween(local(2026, 11, 20, 1), local(2026, 11, 21, 23), cal)).toBe(0);
    expect(businessMsBetween(local(2026, 11, 22), local(2026, 11, 22), cal)).toBe(0);
  });

  it('moves an instant forward by working time across the weekend', () => {
    const thursdayEnd = endOfLocalDay('2026-11-19', cal);
    expect(addBusinessMs(thursdayEnd, DAY, cal).toISOString()).toBe(endOfLocalDay('2026-11-22', cal).toISOString());
    expect(addBusinessMs(thursdayEnd, 0, cal).getTime()).toBe(thursdayEnd.getTime());
  });

  it('refuses a calendar without working days', () => {
    const never: WorkCalendar = { utcOffsetMinutes: 180, weekendDays: [0, 1, 2, 3, 4, 5, 6], holidays: [] };
    expect(() => addBusinessDays(local(2026, 11, 15), 1, never)).toThrow('no working days');
  });
});

describe('deadline engine', () => {
  const original = endOfLocalDay('2026-11-19', cal); // Thursday

  it('without pauses or extensions the current deadline is the original one', () => {
    const s = computeDeadline({ originalDueAt: original, pauses: [], now: local(2026, 11, 16), calendar: cal });
    expect(s.currentDueAt.getTime()).toBe(original.getTime());
    expect(s.isOverdue).toBe(false);
    expect(s.isPaused).toBe(false);
  });

  it('D1: a clarification pause moves the deadline by the paused working time', () => {
    const s = computeDeadline({
      originalDueAt: original,
      pauses: [{ reason: 'clarification', from: local(2026, 11, 16, 9), to: local(2026, 11, 17, 9) }],
      now: local(2026, 11, 18),
      calendar: cal,
    });
    expect(s.pausedBusinessMs).toBe(DAY);
    // one working day after Thursday is Sunday (weekend skipped)
    expect(localDateKey(s.currentDueAt, cal)).toBe('2026-11-22');
    expect(s.originalDueAt.getTime()).toBe(original.getTime());
  });

  it('a short pause does not move a date-based deadline; half a working day or more counts as a day', () => {
    const short = computeDeadline({ originalDueAt: original, pauses: [{ reason: 'awaiting_review', from: local(2026, 11, 16, 9), to: local(2026, 11, 16, 9, 1) }], now: local(2026, 11, 17), calendar: cal });
    expect(short.currentDueAt.getTime()).toBe(original.getTime());
    const half = computeDeadline({ originalDueAt: original, pauses: [{ reason: 'clarification', from: local(2026, 11, 16, 0), to: local(2026, 11, 16, 12) }], now: local(2026, 11, 17), calendar: cal });
    expect([half.pausedBusinessDays, localDateKey(half.currentDueAt, cal)]).toEqual([1, '2026-11-22']);
  });

  it('overlapping pauses count once', () => {
    const s = computeDeadline({
      originalDueAt: original,
      pauses: [
        { reason: 'awaiting_review', from: local(2026, 11, 16, 0), to: local(2026, 11, 17, 0) },
        { reason: 'clarification', from: local(2026, 11, 16, 12), to: local(2026, 11, 17, 0) },
      ],
      now: local(2026, 11, 18),
      calendar: cal,
    });
    expect(s.pausedBusinessMs).toBe(DAY);
  });

  it('an open pause blocks "overdue" even past the date', () => {
    const s = computeDeadline({
      originalDueAt: original,
      pauses: [{ reason: 'awaiting_review', from: local(2026, 11, 19, 10), to: null }],
      now: local(2026, 11, 24, 10),
      calendar: cal,
    });
    expect(s.isPaused).toBe(true);
    expect(s.openPauseReasons).toEqual(['awaiting_review']);
    expect(s.isOverdue).toBe(false);
  });

  it('an approved extension becomes the base; the original is kept', () => {
    const extended = endOfLocalDay('2026-11-26', cal);
    const s = computeDeadline({ originalDueAt: original, approvedExtensionDueAt: extended, pauses: [], now: local(2026, 11, 24), calendar: cal });
    expect(s.baseDueAt.getTime()).toBe(extended.getTime());
    expect(s.currentDueAt.getTime()).toBe(extended.getTime());
    expect(s.originalDueAt.getTime()).toBe(original.getTime());
  });

  it('is overdue after the current deadline when not paused', () => {
    const s = computeDeadline({ originalDueAt: original, pauses: [], now: local(2026, 11, 22, 8), calendar: cal });
    expect(s.isOverdue).toBe(true);
  });

  it('automatic escalation respects the configurable threshold', () => {
    const now = local(2026, 11, 22, 8); // Sunday morning, deadline was Thursday night
    const s = computeDeadline({ originalDueAt: original, pauses: [], now, calendar: cal });
    expect(isAutoEscalationDue(s, now, 0, cal)).toBe(true);
    expect(isAutoEscalationDue(s, now, 1, cal)).toBe(false); // only 8 working hours late
    expect(isAutoEscalationDue(s, local(2026, 11, 23, 1), 1, cal)).toBe(true);
  });

  it('never escalates automatically while paused', () => {
    const now = local(2026, 11, 25);
    const s = computeDeadline({
      originalDueAt: original,
      pauses: [{ reason: 'clarification', from: local(2026, 11, 18), to: null }],
      now,
      calendar: cal,
    });
    expect(isAutoEscalationDue(s, now, 0, cal)).toBe(false);
  });
});
