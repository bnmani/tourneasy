/**
 * Schedule proposal (Phase 6b, D56). Greedy list scheduling over fixed time slots: at every
 * slot start, each free court gets the most urgent match that is ready — its feeder matches
 * have finished (plus rest) and none of its known players is still playing or resting.
 * Urgency: earlier rounds first, losers-bracket rounds between the winners rounds, the final
 * last; then the category order and the match number. Matches already on court or played
 * stay where they are and count as occupied time. Each match takes its own length: a one-game
 * match a short slot, best of 3 the normal one (slotMinutes); the grid steps by the shortest.
 */

export type ScheduleMatch = {
  id: string;
  /** Category order on the tournament (smaller first). */
  eventOrder: number;
  bracket: 'W' | 'L' | 'F';
  round: number;
  number: number;
  /** Player ids known now (both sides); later knockout rounds may have none yet. */
  players: string[];
  /** Matches whose winner (or loser) plays in this one. */
  feeders: string[];
  /** Minimum rest before this match for its players, in minutes. */
  restMinutes: number;
  /** Length of this match's slot in minutes (see slotMinutes). */
  minutes: number;
};

export type FixedSlot = {
  matchId: string;
  court: string;
  start: Date;
  end: Date;
  players: string[];
};
export type PlannedSlot = { matchId: string; court: string; start: Date; end: Date };
export type ScheduleDay = { start: Date; end: Date };

const urgency = (m: ScheduleMatch) =>
  m.bracket === 'F' ? 1000 : m.bracket === 'L' ? (m.round + 1) / 2 + 0.5 : m.round;

export function proposeSchedule(input: {
  matches: ScheduleMatch[];
  courts: string[];
  days: ScheduleDay[];
  fixed?: FixedSlot[];
}): { slots: PlannedSlot[]; unscheduled: string[] } {
  const minutes = input.matches.map((m) => m.minutes);
  // Step through the day by the greatest common divisor, so 15- and 30-minute slots line up.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const stepMs = Math.max(5, minutes.reduce(gcd, minutes[0] ?? 30)) * 60_000;
  const fixed = input.fixed ?? [];
  const courtFree = new Map(input.courts.map((c) => [c, 0]));
  const playerFree = new Map<string, number>(); // end of last match (rest added per match)
  const matchEnd = new Map<string, number>();
  for (const f of fixed) {
    courtFree.set(f.court, Math.max(courtFree.get(f.court) ?? 0, f.end.getTime()));
    matchEnd.set(f.matchId, f.end.getTime());
    for (const p of f.players) playerFree.set(p, Math.max(playerFree.get(p) ?? 0, f.end.getTime()));
  }
  // A fixed slot later in the day also blocks its court from that start.
  const busy = fixed.map((f) => ({
    court: f.court,
    start: f.start.getTime(),
    end: f.end.getTime(),
  }));
  const overlapsFixed = (court: string, start: number, end: number) =>
    busy.some((b) => b.court === court && start < b.end && b.start < end);

  const pending = [...input.matches]
    .filter((m) => !matchEnd.has(m.id))
    .sort((a, b) => urgency(a) - urgency(b) || a.eventOrder - b.eventOrder || a.number - b.number);
  const slots: PlannedSlot[] = [];
  for (const day of input.days) {
    for (let t = day.start.getTime(); t < day.end.getTime() && pending.length; t += stepMs) {
      for (const court of input.courts) {
        if ((courtFree.get(court) ?? 0) > t) continue;
        const rest = (m: ScheduleMatch) => m.restMinutes * 60_000;
        const length = (m: ScheduleMatch) => m.minutes * 60_000;
        const index = pending.findIndex(
          (m) =>
            t + length(m) <= day.end.getTime() &&
            !overlapsFixed(court, t, t + length(m)) &&
            m.feeders.every((f) => matchEnd.has(f) && matchEnd.get(f)! + rest(m) <= t) &&
            m.players.every(
              (p) => (playerFree.get(p) ?? 0) + (playerFree.has(p) ? rest(m) : 0) <= t,
            ),
        );
        if (index < 0) continue;
        const [m] = pending.splice(index, 1);
        const end = t + length(m!);
        slots.push({ matchId: m!.id, court, start: new Date(t), end: new Date(end) });
        courtFree.set(court, end);
        matchEnd.set(m!.id, end);
        for (const p of m!.players) playerFree.set(p, end);
      }
    }
  }
  return { slots, unscheduled: pending.map((m) => m.id) };
}

/**
 * Slot length for a match from its number of games: one game the short slot (default 15),
 * best of 3 the normal one (default 30), best of 5 proportionally longer.
 */
export function slotMinutes(
  bestOf: number,
  t: { matchMinutes: number; singleGameMinutes: number },
): number {
  if (bestOf <= 1) return t.singleGameMinutes;
  if (bestOf >= 5) return Math.round((t.matchMinutes * 5) / 3 / 5) * 5;
  return t.matchMinutes;
}

/** Default rest for a category: hybrid formats play short matches in a row (D56). */
export function defaultRestMinutes(drawType: string, tournamentRest: number): number {
  return drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT' ? Math.min(tournamentRest, 10) : tournamentRest;
}

/** Players who play twice too close together (for warnings after manual changes). */
export function restConflicts(
  slots: { matchId: string; start: Date; end: Date; players: string[]; restMinutes: number }[],
): { matchId: string; player: string }[] {
  const out: { matchId: string; player: string }[] = [];
  const sorted = [...slots].sort((a, b) => a.start.getTime() - b.start.getTime());
  const last = new Map<string, { end: number }>();
  for (const s of sorted) {
    for (const p of s.players) {
      const prev = last.get(p);
      if (prev && prev.end + s.restMinutes * 60_000 > s.start.getTime())
        out.push({ matchId: s.matchId, player: p });
      last.set(p, { end: s.end.getTime() });
    }
  }
  return out;
}
