/**
 * Business-day calendar (BR-NTF-03).
 *
 * All deadline maths happens in the client's local time using a fixed UTC
 * offset (Asia/Riyadh has no daylight saving). A "date key" is a local
 * calendar date written as YYYY-MM-DD.
 */

export interface WorkCalendar {
  /** Minutes east of UTC. Asia/Riyadh = 180. */
  utcOffsetMinutes: number;
  /** Local weekday numbers that are not worked: 0 = Sunday … 6 = Saturday. Saudi Arabia: [5, 6]. */
  weekendDays: number[];
  /** Local dates (YYYY-MM-DD) that are public holidays. */
  holidays: string[];
  /** Local dates that are worked even though they fall on a weekend. */
  workingOverrides?: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const SAUDI_CALENDAR: WorkCalendar = {
  utcOffsetMinutes: 180,
  weekendDays: [5, 6],
  holidays: [],
  workingOverrides: [],
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date key for an instant. */
export function localDateKey(at: Date, cal: WorkCalendar): string {
  const local = new Date(at.getTime() + cal.utcOffsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** UTC instant at which a local date starts. */
export function startOfLocalDay(dateKey: string, cal: WorkCalendar): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - cal.utcOffsetMinutes * 60_000);
}

/** Last millisecond of a local date. Deadlines fall here. */
export function endOfLocalDay(dateKey: string, cal: WorkCalendar): Date {
  return new Date(startOfLocalDay(dateKey, cal).getTime() + DAY_MS - 1);
}

function nextDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWorkingDay(dateKey: string, cal: WorkCalendar): boolean {
  if (cal.workingOverrides?.includes(dateKey)) return true;
  if (cal.holidays.includes(dateKey)) return false;
  return !cal.weekendDays.includes(weekdayOf(dateKey));
}

const MAX_SCAN_DAYS = 3660; // ten years: guards against a calendar with no working days

/**
 * Deadline that is `businessDays` working days after `from`.
 * The start day itself is not counted; 0 means the end of the start day
 * (or of the next working day when the start day is not worked).
 */
export function addBusinessDays(from: Date, businessDays: number, cal: WorkCalendar): Date {
  if (!Number.isInteger(businessDays) || businessDays < 0) {
    throw new RangeError('businessDays must be a non-negative integer');
  }
  let key = localDateKey(from, cal);
  let scanned = 0;
  if (businessDays === 0) {
    while (!isWorkingDay(key, cal)) {
      key = nextDateKey(key);
      if (++scanned > MAX_SCAN_DAYS) throw new Error('Calendar has no working days');
    }
    return endOfLocalDay(key, cal);
  }
  let remaining = businessDays;
  while (remaining > 0) {
    key = nextDateKey(key);
    if (++scanned > MAX_SCAN_DAYS) throw new Error('Calendar has no working days');
    if (isWorkingDay(key, cal)) remaining -= 1;
  }
  return endOfLocalDay(key, cal);
}

/** Working time (ms) between two instants: whole working days count fully, non-working days not at all. */
export function businessMsBetween(from: Date, to: Date, cal: WorkCalendar): number {
  if (to.getTime() <= from.getTime()) return 0;
  let total = 0;
  let key = localDateKey(from, cal);
  let scanned = 0;
  for (;;) {
    const dayStart = startOfLocalDay(key, cal).getTime();
    const dayEnd = dayStart + DAY_MS;
    if (dayStart >= to.getTime()) break;
    if (isWorkingDay(key, cal)) {
      const s = Math.max(dayStart, from.getTime());
      const e = Math.min(dayEnd, to.getTime());
      if (e > s) total += e - s;
    }
    key = nextDateKey(key);
    if (++scanned > MAX_SCAN_DAYS) break;
  }
  return total;
}

/** Moves an instant forward by `ms` of working time, skipping non-working days. */
export function addBusinessMs(from: Date, ms: number, cal: WorkCalendar): Date {
  if (ms <= 0) return new Date(from.getTime());
  let remaining = ms;
  let cursor = from.getTime();
  let key = localDateKey(from, cal);
  let scanned = 0;
  for (;;) {
    const dayStart = startOfLocalDay(key, cal).getTime();
    const dayEnd = dayStart + DAY_MS;
    if (isWorkingDay(key, cal)) {
      const s = Math.max(dayStart, cursor);
      const available = dayEnd - s;
      if (available > remaining) return new Date(s + remaining);
      remaining -= available;
    }
    cursor = dayEnd;
    key = nextDateKey(key);
    if (++scanned > MAX_SCAN_DAYS) throw new Error('Calendar has no working days');
  }
}
