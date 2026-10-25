import { appTimeZone } from '../i18n';

/** Offset of Europe/Amsterdam from UTC at `instant`, in minutes (60 in winter, 120 in summer). */
function amsterdamOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: appTimeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * "2027-03-13T09:30" entered by an organiser (Dutch wall-clock time) → UTC Date.
 * Returns null for invalid input. DST transitions resolve to the later offset.
 */
export function amsterdamLocalToUtc(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - amsterdamOffsetMinutes(new Date(guess)) * 60_000;
  // Re-check with the offset at the computed instant (matters around DST changes).
  utc = guess - amsterdamOffsetMinutes(new Date(utc)) * 60_000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** UTC Date → "YYYY-MM-DDTHH:mm" in Dutch time, for datetime-local inputs. */
export function utcToAmsterdamLocal(date: Date): string {
  const shifted = new Date(date.getTime() + amsterdamOffsetMinutes(date) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** "HH:MM" (24h). */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Whether a check-in counts for a match day (D74), days as YYYY-MM-DD in Dutch time: a check-in
 * on that day or later counts (a match running late, a player present now); on the
 * tournament's first day an earlier one counts too (the evening before, or testing ahead). Only
 * a check-in from an earlier day doesn't carry over to day 2 and later: players check in again.
 */
export function checkedInFor(
  checkedInAt: Date | null | undefined,
  day: string,
  firstDay: string,
): boolean {
  if (!checkedInAt) return false;
  const on = utcToAmsterdamLocal(checkedInAt).slice(0, 10);
  return on >= day || day === firstDay;
}
