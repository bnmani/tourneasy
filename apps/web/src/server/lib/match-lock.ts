/** Dutch calendar day (YYYY-MM-DD): a result locks the day after the match finished. */
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const amsterdamDay = (d: Date) => dayFormat.format(d);

/**
 * A played match is locked when the owner locked it, or from the next Dutch day after it
 * finished, unless the owner unlocked it (autoLockWaived).
 */
export function isMatchLocked(
  m: { lockedAt: Date | null; completedAt: Date | null; autoLockWaived: boolean },
  now = new Date(),
): boolean {
  if (m.lockedAt) return true;
  if (!m.completedAt || m.autoLockWaived) return false;
  return amsterdamDay(now) > amsterdamDay(m.completedAt);
}
