import { randomUUID } from 'node:crypto';
import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/test/db';
import { claimCourt, listCourts, releaseCourt } from './umpire-court-service';
import { finishMatch, postEvents, startMatch } from './umpire-scoring-service';

beforeEach(resetDatabase);

let n = 0;
/** A tournament with two courts, a match on court 1, and two umpires. */
async function setup(
  scoring: { bestOf: number; pointsToWin: number; pointsCap: number } = {
    bestOf: 1,
    pointsToWin: 3,
    pointsCap: 5,
  },
) {
  n += 1;
  const venue = await prisma.venue.create({
    data: {
      name: `Hal ${n}`,
      slug: `hal-${n}`,
      street: 'Sportlaan',
      houseNumber: '1',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: 2,
    },
  });
  const tournament = await prisma.tournament.create({
    data: {
      name: `Toernooi ${n}`,
      slug: `toernooi-${n}`,
      venueId: venue.id,
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-02-01'),
      entryDeadline: new Date('2027-02-01'),
      withdrawalDeadline: new Date('2027-02-01'),
    },
  });
  const court1 = await prisma.court.create({ data: { venueId: venue.id, number: 1 } });
  const court2 = await prisma.court.create({ data: { venueId: venue.id, number: 2 } });
  const event = await prisma.tournamentEvent.create({
    data: { tournamentId: tournament.id, discipline: 'DE', feeCents: 0, ...scoring },
  });
  const draw = await prisma.draw.create({
    data: { eventId: event.id, type: 'KNOCKOUT', size: 2, status: 'PUBLISHED' },
  });
  const match = await prisma.match.create({
    data: { drawId: draw.id, round: 1, matchNumber: 1, status: 'CALLED' },
  });
  await prisma.courtSlot.create({
    data: {
      tournamentId: tournament.id,
      courtId: court1.id,
      matchId: match.id,
      startsAt: new Date('2027-03-13T09:00:00Z'),
      endsAt: new Date('2027-03-13T10:00:00Z'),
    },
  });
  const umpire = (name: string) => {
    n += 1;
    return prisma.umpire.create({
      data: {
        tournamentId: tournament.id,
        displayName: name,
        pinHash: `pin-${n}`,
        qrTokenHash: `qr-${n}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  };
  const anna = await umpire('Anna');
  const bram = await umpire('Bram');
  return { tournament, court1, court2, match, anna, bram };
}

/** An umpire who holds the court and has started the match. */
async function started(serving: 'A' | 'B' = 'A', scoring?: Parameters<typeof setup>[0]) {
  const s = await setup(scoring);
  await claimCourt(s.anna.id, s.court1.id);
  await startMatch(s.anna.id, s.match.id, serving);
  return s;
}

let seq = 0;
const point = (side: 'A' | 'B', at = ++seq) => ({
  id: randomUUID(),
  seq: at,
  kind: 'POINT' as const,
  side,
});
const undo = (at = ++seq) => ({ id: randomUUID(), seq: at, kind: 'UNDO' as const });

describe('court holds', () => {
  it('second umpire on a held court gets 409', async () => {
    const s = await setup();
    await claimCourt(s.anna.id, s.court1.id);
    const error = await claimCourt(s.bram.id, s.court1.id).catch((e) => e);
    expect(error).toMatchObject({ code: 'courtHeld', status: 409 });
    const hold = await prisma.courtHold.findUniqueOrThrow({ where: { courtId: s.court1.id } });
    expect(hold.umpireId).toBe(s.anna.id);
  });

  it('two umpires claiming at the same moment: exactly one wins', async () => {
    const s = await setup();
    const results = await Promise.allSettled([
      claimCourt(s.anna.id, s.court1.id),
      claimCourt(s.bram.id, s.court1.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.courtHold.count()).toBe(1);
  });

  it('claiming again as the holder is fine', async () => {
    const s = await setup();
    await claimCourt(s.anna.id, s.court1.id);
    await expect(claimCourt(s.anna.id, s.court1.id)).resolves.toBeUndefined();
  });

  it('only the holder can release the court', async () => {
    const s = await setup();
    await claimCourt(s.anna.id, s.court1.id);
    await expect(releaseCourt(s.bram.id, s.court1.id)).rejects.toMatchObject({ status: 403 });
    expect(await prisma.courtHold.count()).toBe(1);
    await releaseCourt(s.anna.id, s.court1.id);
    expect(await prisma.courtHold.count()).toBe(0);
    await expect(claimCourt(s.bram.id, s.court1.id)).resolves.toBeUndefined();
  });

  it('refuses a court of another venue and a revoked umpire', async () => {
    const s = await setup();
    const other = await setup();
    await expect(claimCourt(s.anna.id, other.court1.id)).rejects.toMatchObject({ status: 404 });
    await prisma.umpire.update({ where: { id: s.bram.id }, data: { revokedAt: new Date() } });
    await expect(claimCourt(s.bram.id, s.court1.id)).rejects.toMatchObject({ status: 401 });
  });

  it('lists courts with holder and only the current match', async () => {
    const s = await setup();
    await claimCourt(s.anna.id, s.court1.id);
    const forBram = await listCourts(s.tournament.id, s.bram.id);
    expect(forBram.map((c) => c.number)).toEqual([1, 2]);
    expect(forBram[0]).toMatchObject({
      status: 'HELD',
      holderName: 'Anna',
      match: { id: s.match.id, status: 'CALLED' },
    });
    expect(forBram[1]).toMatchObject({ status: 'FREE', holderName: null, match: null });
    const forAnna = await listCourts(s.tournament.id, s.anna.id);
    expect(forAnna[0]!.status).toBe('HELD_BY_ME');
    await prisma.match.update({ where: { id: s.match.id }, data: { status: 'COMPLETED' } });
    expect((await listCourts(s.tournament.id, s.anna.id))[0]!.match).toBeNull();
  });
});

describe('scoring events', () => {
  it('stores accepted events with umpire and time, and returns the score', async () => {
    const s = await started('B');
    const events = [point('A'), point('B'), point('B')];
    const result = await postEvents(s.anna.id, s.match.id, events);
    expect(result).toMatchObject({
      applied: 3,
      duplicates: 0,
      serving: 'B',
      games: [[1, 2]],
      version: 2, // one for starting the match, one for this batch
    });
    const rows = await prisma.umpireEvent.findMany({
      where: { matchId: s.match.id },
      orderBy: { seq: 'asc' },
    });
    expect(rows.map((r) => r.id)).toEqual(events.map((e) => e.id));
    expect(rows.every((r) => r.umpireId === s.anna.id && r.courtId === s.court1.id)).toBe(true);
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('starts from the server the umpire chose', async () => {
    const s = await started('B');
    const result = await postEvents(s.anna.id, s.match.id, []);
    expect(result.serving).toBe('B');
    const stored = await prisma.match.findUniqueOrThrow({ where: { id: s.match.id } });
    expect(stored).toMatchObject({ umpireStartServer: 'B', status: 'IN_PROGRESS' });
  });

  it('re-sent events are not applied twice', async () => {
    const s = await started();
    const events = [point('A'), point('A')];
    await postEvents(s.anna.id, s.match.id, events);
    const again = await postEvents(s.anna.id, s.match.id, [...events, point('B')]);
    expect(again).toMatchObject({ applied: 1, duplicates: 2, games: [[2, 1]] });
    expect(await prisma.umpireEvent.count({ where: { matchId: s.match.id } })).toBe(3);
  });

  it('the same event twice in one batch counts once', async () => {
    const s = await started();
    const e = point('A');
    const result = await postEvents(s.anna.id, s.match.id, [e, e]);
    expect(result).toMatchObject({ applied: 1, duplicates: 1, games: [[1, 0]] });
  });

  it('undo reaches a point sent in an earlier batch', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A'), point('B')]);
    const result = await postEvents(s.anna.id, s.match.id, [undo()]);
    expect(result).toMatchObject({ applied: 1, games: [[1, 0]], serving: 'A' });
    expect(result.rejected).toBeUndefined();
  });

  it('events are applied in seq order, whatever the arrival order', async () => {
    const s = await started();
    const a = point('A', 1);
    const b = point('B', 2);
    const result = await postEvents(s.anna.id, s.match.id, [b, a]);
    expect(result).toMatchObject({ applied: 2, serving: 'B' });
    const rows = await prisma.umpireEvent.findMany({
      where: { matchId: s.match.id },
      orderBy: { seq: 'asc' },
    });
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it('a rejected undo returns the reason and writes nothing for it', async () => {
    const s = await started();
    const result = await postEvents(s.anna.id, s.match.id, [undo()]);
    expect(result).toMatchObject({ applied: 0, rejected: 'nothingToUndo', games: [] });
    expect(await prisma.umpireEvent.count()).toBe(0);
  });

  it('keeps the events before a rejected one and stops there', async () => {
    const s = await started();
    const bad = { id: randomUUID(), seq: 2, kind: 'POINT' as const };
    const result = await postEvents(s.anna.id, s.match.id, [point('A', 1), bad, point('B', 3)]);
    expect(result).toMatchObject({ applied: 1, rejected: 'pointNeedsSide', games: [[1, 0]] });
    expect(await prisma.umpireEvent.count()).toBe(1);
  });

  it('point after finish is refused', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A'), point('A'), point('A')]);
    // decided by the rules before the umpire sends it to the desk
    const late = await postEvents(s.anna.id, s.match.id, [point('B')]);
    expect(late).toMatchObject({ applied: 0, rejected: 'matchFinished' });
    await finishMatch(s.anna.id, s.match.id);
    const after = await postEvents(s.anna.id, s.match.id, [point('B')]);
    expect(after).toMatchObject({ applied: 0, rejected: 'matchFinished' });
    expect(await prisma.umpireEvent.count()).toBe(3);
  });

  it('only the holder of the court can post events', async () => {
    const s = await started();
    await expect(postEvents(s.bram.id, s.match.id, [point('A')])).rejects.toMatchObject({
      status: 409,
    });
    await releaseCourt(s.anna.id, s.court1.id);
    await expect(postEvents(s.anna.id, s.match.id, [point('A')])).rejects.toMatchObject({
      status: 403,
    });
    expect(await prisma.umpireEvent.count()).toBe(0);
  });

  it('refuses events before the match is started', async () => {
    const s = await setup();
    await claimCourt(s.anna.id, s.court1.id);
    await expect(postEvents(s.anna.id, s.match.id, [point('A')])).rejects.toMatchObject({
      code: 'statusTransition',
    });
  });

  it('a seq at or below the stored log is a conflict, nothing is written', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A', 1), point('A', 2)]);
    await expect(postEvents(s.anna.id, s.match.id, [point('B', 2)])).rejects.toMatchObject({
      code: 'resultConflict',
    });
    expect(await prisma.umpireEvent.count()).toBe(2);
  });

  it('two writers at once: one wins, the other gets a conflict', async () => {
    const s = await started();
    const results = await Promise.allSettled([
      postEvents(s.anna.id, s.match.id, [point('A', 1)]),
      postEvents(s.anna.id, s.match.id, [point('B', 1)]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'resultConflict' });
    expect(await prisma.umpireEvent.count()).toBe(1);
  });

  it('events are never updated or deleted by later calls', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A'), point('B')]);
    const before = await prisma.umpireEvent.findMany({ orderBy: { seq: 'asc' } });
    await postEvents(s.anna.id, s.match.id, [undo(), point('A')]);
    const after = await prisma.umpireEvent.findMany({
      where: { id: { in: before.map((e) => e.id) } },
      orderBy: { seq: 'asc' },
    });
    expect(after).toEqual(before);
  });

  it('a match with umpire events cannot be deleted', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A')]);
    await prisma.courtSlot.deleteMany();
    await expect(prisma.match.delete({ where: { id: s.match.id } })).rejects.toThrow();
  });
});

describe('finish', () => {
  it('finish is refused while the match is not decided', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A'), point('B')]);
    await expect(finishMatch(s.anna.id, s.match.id)).rejects.toMatchObject({
      code: 'matchNotDecided',
      status: 409,
    });
    const m = await prisma.match.findUniqueOrThrow({ where: { id: s.match.id } });
    expect(m.status).toBe('IN_PROGRESS');
  });

  it('a decided match goes to the desk', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('B'), point('B'), point('B')]);
    const result = await finishMatch(s.anna.id, s.match.id);
    expect(result).toMatchObject({ status: 'AWAITING_DESK', games: [[0, 3]] });
    const m = await prisma.match.findUniqueOrThrow({ where: { id: s.match.id } });
    expect(m.status).toBe('AWAITING_DESK');
    // sending it again changes nothing
    await expect(finishMatch(s.anna.id, s.match.id)).resolves.toMatchObject({
      status: 'AWAITING_DESK',
    });
  });

  it('only the holder can finish', async () => {
    const s = await started();
    await postEvents(s.anna.id, s.match.id, [point('A'), point('A'), point('A')]);
    await expect(finishMatch(s.bram.id, s.match.id)).rejects.toMatchObject({ status: 409 });
  });
});
