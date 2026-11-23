/** Dutch calendar day (YYYY-MM-DD): a played match closes the day after it finished. */
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const amsterdamDay = (d: Date) => dayFormat.format(d);

/**
 * Check-in for a match is closed once the owner locks it, or from the next Dutch day after it
 * finished. Owner unlocks don't reopen it.
 */
export function isCheckInClosed(
  m: { lockedAt: Date | null; completedAt: Date | null },
  now = new Date(),
): boolean {
  if (m.lockedAt) return true;
  return !!m.completedAt && amsterdamDay(now) > amsterdamDay(m.completedAt);
}

/** The score is locked while check-in is closed, unless the owner has unlocked the score. */
export function isScoreLocked(
  m: { lockedAt: Date | null; completedAt: Date | null; scoreUnlockedAt: Date | null },
  now = new Date(),
): boolean {
  return isCheckInClosed(m, now) && !m.scoreUnlockedAt;
}
