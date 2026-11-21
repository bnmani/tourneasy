/**
 * Semi-final pairing by seed (D127). In a single knockout with seeds and no byes, the four
 * teams left after the quarter-finals are paired best against worst and second against third
 * (seeds 2, 3, 12, 16 → 2 v 16 and 3 v 12). The semi-finals are filled in only when the last
 * quarter-final is done. Organisers can switch it off per category (fixed bracket). The switch
 * is kept in SiteSetting, like the expected rounds (D121), so no migration is needed.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';

type Tx = Prisma.TransactionClient;

/** SiteSetting key: the categories (event ids) that keep the fixed bracket. */
export const SEMI_FIXED_KEY = 'knockout.semiFixed';

async function fixedList(db: Tx | typeof prisma = prisma): Promise<string[]> {
  const row = await db.siteSetting.findUnique({ where: { key: SEMI_FIXED_KEY } });
  return Array.isArray(row?.value) ? (row.value as string[]) : [];
}

export async function isSemiPairingOn(eventId: string) {
  return !(await fixedList()).includes(eventId);
}

/** Organisers and admins: pair the semi-finals by seed (on) or keep the fixed bracket (off). */
export async function setSemiPairing(
  actor: Actor,
  tournamentId: string,
  eventId: string,
  on: boolean,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const event = await prisma.tournamentEvent.findFirst({
    where: { id: eventId, tournamentId },
    select: { id: true },
  });
  if (!event) throw new AppError('notFound');
  const list = (await fixedList()).filter((id) => id !== eventId);
  const next = on ? list : [...list, eventId];
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: SEMI_FIXED_KEY },
      create: { key: SEMI_FIXED_KEY, value: next },
      update: { value: next },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'draw.semiPairing',
      entityType: 'TournamentEvent',
      entityId: eventId,
      after: { on },
      meta,
    });
  });
}

type Ctx = {
  semis: { id: string; status: string }[];
  feeders: { id: string; winnerEntryId: string | null }[];
  seedOf: Map<string, number>;
};

/**
 * The semi-final set-up of a draw when the rule applies: a single knockout of 8 or more, one
 * bracket, no byes, every entry seeded, and the category has not switched the rule off.
 */
async function semiContext(tx: Tx, drawId: string): Promise<Ctx | null> {
  const draw = await tx.draw.findUnique({
    where: { id: drawId },
    select: {
      type: true,
      eventId: true,
      matches: {
        select: { id: true, round: true, bracket: true, status: true, winnerEntryId: true },
        orderBy: { matchNumber: 'asc' },
      },
      entries: { select: { id: true, registrationId: true, seed: true } },
    },
  });
  if (!draw || draw.type === 'DOUBLE_KNOCKOUT' || draw.type === 'ROUND_ROBIN') return null;
  if (draw.matches.length === 0 || draw.matches.some((m) => m.bracket !== 'W')) return null;
  const last = Math.max(...draw.matches.map((m) => m.round));
  const inRound = (r: number) => draw.matches.filter((m) => m.round === r);
  if (inRound(last).length !== 1 || inRound(last - 1).length !== 2) return null;
  if (inRound(last - 2).length !== 4) return null;
  if (draw.entries.some((e) => !e.registrationId || e.seed === null)) return null;
  if (!(await isSemiPairingOn(draw.eventId))) return null;
  return {
    semis: inRound(last - 1),
    feeders: inRound(last - 2),
    seedOf: new Map(draw.entries.map((e) => [e.id, e.seed as number])),
  };
}

/** True when a result of this match must not move the winner on by itself (a quarter-final). */
export async function holdsWinnerForSemis(tx: Tx, m: { id: string; drawId: string }) {
  const ctx = await semiContext(tx, m.drawId);
  return !!ctx && ctx.feeders.some((f) => f.id === m.id);
}

const open = (s: string) => s === 'SCHEDULED' || s === 'CALLED';

/** A correction that changes a quarter-final winner needs both semi-finals not started. */
export async function assertSemisOpen(tx: Tx, m: { drawId: string }) {
  const ctx = await semiContext(tx, m.drawId);
  if (ctx && ctx.semis.some((s) => !open(s.status))) throw new AppError('nextMatchPlayed');
}

/**
 * Fills the semi-finals once all four quarter-finals have a winner, and empties them again
 * when one no longer does. A started semi-final is never touched.
 */
export async function pairSemis(tx: Tx, drawId: string) {
  const ctx = await semiContext(tx, drawId);
  if (!ctx || ctx.semis.some((s) => !open(s.status))) return;
  const [s1, s2] = ctx.semis as [Ctx['semis'][number], Ctx['semis'][number]];
  const winners = ctx.feeders.map((f) => f.winnerEntryId);
  if (winners.some((w) => !w)) {
    for (const s of ctx.semis)
      await tx.match.update({
        where: { id: s.id },
        data: { entryAId: null, entryBId: null, version: { increment: 1 } },
      });
    return;
  }
  const seeded = ctx.feeders
    .map((f) => ({
      feeder: f.id,
      entry: f.winnerEntryId!,
      seed: ctx.seedOf.get(f.winnerEntryId!)!,
    }))
    .sort((a, b) => a.seed - b.seed);
  if (new Set(seeded.map((x) => x.seed)).size !== 4) return;
  const [best, second, third, worst] = seeded as [
    (typeof seeded)[number],
    (typeof seeded)[number],
    (typeof seeded)[number],
    (typeof seeded)[number],
  ];
  const places = [
    { semi: s1.id, slot: 'A', x: best },
    { semi: s1.id, slot: 'B', x: worst },
    { semi: s2.id, slot: 'A', x: second },
    { semi: s2.id, slot: 'B', x: third },
  ];
  for (const s of [s1, s2]) {
    const own = places.filter((p) => p.semi === s.id);
    await tx.match.update({
      where: { id: s.id },
      data: {
        entryAId: own.find((p) => p.slot === 'A')!.x.entry,
        entryBId: own.find((p) => p.slot === 'B')!.x.entry,
        version: { increment: 1 },
      },
    });
  }
  for (const p of places)
    await tx.match.update({
      where: { id: p.x.feeder },
      data: { nextMatchId: p.semi, nextMatchSlot: p.slot },
    });
}
