import { randomUUID } from 'node:crypto';
import { prisma, Role } from '@tourneasy/db';
import { seededRng } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { deleteDraft, generateDraw, publishDraws, swapEntries } from './draw-service';
import { actorFromWebToken, createWebSession } from './session-service';
import { claimCourt } from './umpire-court-service';
import {
  confirmMatchResult,
  correctMatchScore,
  deskAlerts,
  resolveDeskAlert,
  umpireDeskReview,
  finishMatch,
  postEvents,
  startMatch,
} from './umpire-scoring-service';
import { requestTakeover } from './umpire-court-service';
import { timeoutTakeovers } from '../jobs/takeover-timeout';

beforeEach(resetDatabase);

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

/** A tournament with four entries, a drawn event and two courts. bestOf 1, first to 3, cap 5. */
async function setup(publish = true) {
  const actor = await admin();
  const venue = await prisma.venue.create({
    data: {
      name: 'Sporthal',
      slug: 'sporthal',
      street: 'Weg',
      houseNumber: '1',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: 2,
    },
  });
  const tournament = await prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2026-02-01'),
      entryDeadline: new Date('2026-02-01'),
      withdrawalDeadline: new Date('2026-02-01'),
      isPublished: true,
      status: 'CLOSED',
      venueId: venue.id,
    },
  });
  const court1 = await prisma.court.create({ data: { venueId: venue.id, number: 1 } });
  const court2 = await prisma.court.create({ data: { venueId: venue.id, number: 2 } });
  const event = await prisma.tournamentEvent.create({
    data: {
      tournamentId: tournament.id,
      discipline: 'DE',
      feeCents: 0,
      drawType: 'KNOCKOUT',
      bestOf: 1,
      pointsToWin: 3,
      pointsCap: 5,
    },
  });
  for (let i = 0; i < 4; i++) {
    const p = await createPlayer();
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: p.userId } });
    await prisma.registration.create({
      data: {
        eventId: event.id,
        status: 'CONFIRMED',
        participants: {
          create: {
            eventId: event.id,
            playerId: profile.id,
            role: 'PRIMARY',
            checkInToken: `t${i}`,
          },
        },
      },
    });
  }
  await generateDraw(actor, event.id, meta, seededRng(1));
  if (publish) await publishDraws(actor, event.id, true, meta);
  const match = await prisma.match.findFirstOrThrow({
    where: {
      draw: { eventId: event.id },
      round: 1,
      entryAId: { not: null },
      entryBId: { not: null },
    },
    orderBy: { matchNumber: 'asc' },
  });
  return { actor, tournament, court1, court2, event, match };
}

let n = 0;
async function umpire(tournamentId: string, name: string) {
  n += 1;
  return prisma.umpire.create({
    data: {
      tournamentId,
      displayName: name,
      pinHash: `pin-${n}`,
      qrTokenHash: `qr-${n}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
}

/** The umpire plays A to 3-0 and sends the match to the desk. */
async function sentToDesk() {
  const s = await setup();
  const anna = await umpire(s.tournament.id, 'Anna K.');
  await prisma.courtSlot.create({
    data: {
      tournamentId: s.tournament.id,
      courtId: s.court1.id,
      matchId: s.match.id,
      startsAt: new Date('2027-03-13T09:00:00Z'),
      endsAt: new Date('2027-03-13T10:00:00Z'),
    },
  });
  await claimCourt(anna.id, s.court1.id);
  await startMatch(anna.id, s.match.id, 'A');
  await postEvents(
    anna.id,
    s.match.id,
    [1, 2, 3].map((seq) => ({ id: randomUUID(), seq, kind: 'POINT' as const, side: 'A' as const })),
  );
  await finishMatch(anna.id, s.match.id);
  return { ...s, anna };
}

describe('desk confirmation', () => {
  it('desk confirmation uses recordResult and updates standings', async () => {
    const s = await sentToDesk();
    const before = await prisma.match.findUniqueOrThrow({ where: { id: s.match.id } });
    expect(before.status).toBe('AWAITING_DESK');

    await confirmMatchResult(s.actor, s.match.id, meta);

    const after = await prisma.match.findUniqueOrThrow({
      where: { id: s.match.id },
      include: { sets: true },
    });
    expect(after.status).toBe('COMPLETED');
    expect(after.winnerEntryId).toBe(before.entryAId);
    expect(after.sets.map((x) => [x.scoreA, x.scoreB])).toEqual([[3, 0]]);
    // The winner moved on through the existing path: into the next match of the draw.
    const next = await prisma.match.findUniqueOrThrow({ where: { id: after.nextMatchId! } });
    expect([next.entryAId, next.entryBId]).toContain(before.entryAId);
    // The existing result audit entry, written by recordResult.
    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Match', entityId: s.match.id, action: 'match.result' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe(s.actor.userId);
  });

  it('refuses a match that is not waiting for the desk', async () => {
    const s = await setup();
    await expect(confirmMatchResult(s.actor, s.match.id, meta)).rejects.toMatchObject({
      code: 'statusTransition',
    });
  });

  it('confirm after a correction records the corrected score', async () => {
    const s = await sentToDesk();
    await correctMatchScore(s.actor, s.match.id, [[4, 2]], 'Umpire missed a point', meta);
    await confirmMatchResult(s.actor, s.match.id, meta);
    const sets = await prisma.matchSet.findMany({ where: { matchId: s.match.id } });
    expect(sets.map((x) => [x.scoreA, x.scoreB])).toEqual([[4, 2]]);
  });
});

describe('desk correction', () => {
  it('correction without a reason is refused', async () => {
    const s = await sentToDesk();
    for (const reason of ['', '   ']) {
      await expect(
        correctMatchScore(s.actor, s.match.id, [[3, 1]], reason, meta),
      ).rejects.toMatchObject({ code: 'validation' });
    }
    expect(await prisma.auditLog.count({ where: { action: 'match.umpireCorrect' } })).toBe(0);
    const review = await umpireDeskReview(s.actor, s.match.id);
    expect(review.corrected).toBe(false);
  });

  it('logs old and new score, reason and actor, and never touches the umpire events', async () => {
    const s = await sentToDesk();
    const eventsBefore = await prisma.umpireEvent.findMany({
      where: { matchId: s.match.id },
      orderBy: { seq: 'asc' },
    });
    await correctMatchScore(s.actor, s.match.id, [[3, 1]], '  Wrong side tapped  ', meta);

    const [entry] = await prisma.auditLog.findMany({ where: { action: 'match.umpireCorrect' } });
    expect(entry).toMatchObject({
      actorId: s.actor.userId,
      entityType: 'Match',
      entityId: s.match.id,
      before: { games: [[3, 0]] },
      after: { games: [[3, 1]], reason: 'Wrong side tapped' },
    });
    expect(entry!.createdAt).toBeInstanceOf(Date);

    expect(
      await prisma.umpireEvent.findMany({
        where: { matchId: s.match.id },
        orderBy: { seq: 'asc' },
      }),
    ).toEqual(eventsBefore);

    const review = await umpireDeskReview(s.actor, s.match.id);
    expect(review.umpire).toMatchObject({ name: 'Anna K.', games: [[3, 0]] });
    expect(review.games).toEqual([[3, 1]]);
    expect(review.corrected).toBe(true);
    expect(review.changeLog.map((c) => c.kind)).toEqual(['sent', 'correct']);
    expect(review.changeLog[1]).toMatchObject({ reason: 'Wrong side tapped' });
  });

  it('refuses an invalid score and a match that is not waiting for the desk', async () => {
    const s = await sentToDesk();
    await expect(correctMatchScore(s.actor, s.match.id, [[2, 1]], 'x', meta)).rejects.toMatchObject(
      { code: 'validation' },
    );
    expect(await prisma.auditLog.count({ where: { action: 'match.umpireCorrect' } })).toBe(0);
    await confirmMatchResult(s.actor, s.match.id, meta);
    await expect(
      correctMatchScore(s.actor, s.match.id, [[3, 1]], 'Too late', meta),
    ).rejects.toMatchObject({ code: 'statusTransition' });
  });
});

describe('desk alerts', () => {
  async function alertSetup() {
    const s = await sentToDesk();
    // A second match on court 2: Bram holds it, Cora asks to take over, nobody answers.
    const bram = await umpire(s.tournament.id, 'Bram');
    const cora = await umpire(s.tournament.id, 'Cora');
    await claimCourt(bram.id, s.court2.id);
    const request = await requestTakeover(cora.id, s.court2.id);
    await prisma.takeoverRequest.update({
      where: { id: request.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await timeoutTakeovers();
    const alert = await prisma.deskAlert.findFirstOrThrow({
      where: { takeoverRequestId: request.id },
    });
    return { ...s, bram, cora, alert };
  }

  it('desk alert resolves once', async () => {
    const s = await alertSetup();
    const open = await deskAlerts(s.actor, s.tournament.id);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      id: s.alert.id,
      courtNumber: 2,
      requester: 'Cora',
      holder: 'Bram',
    });

    await resolveDeskAlert(s.actor, s.alert.id, 'ASSIGN_RESERVE', meta);
    expect((await prisma.deskAlert.findUniqueOrThrow({ where: { id: s.alert.id } })).status).toBe(
      'RESOLVED',
    );
    expect(
      (await prisma.courtHold.findUniqueOrThrow({ where: { courtId: s.court2.id } })).umpireId,
    ).toBe(s.cora.id);
    expect(await deskAlerts(s.actor, s.tournament.id)).toHaveLength(0);

    // Resolving again is refused and applies nothing.
    await expect(resolveDeskAlert(s.actor, s.alert.id, 'KEEP_CURRENT', meta)).rejects.toMatchObject(
      {
        code: 'alertResolved',
      },
    );
    await expect(
      resolveDeskAlert(s.actor, s.alert.id, 'ASSIGN_RESERVE', meta),
    ).rejects.toMatchObject({
      code: 'alertResolved',
    });
    expect(
      (await prisma.courtHold.findUniqueOrThrow({ where: { courtId: s.court2.id } })).umpireId,
    ).toBe(s.cora.id);
    expect(await prisma.auditLog.count({ where: { action: 'deskAlert.resolve' } })).toBe(1);
  });

  it('keeping the current umpire leaves the hold alone', async () => {
    const s = await alertSetup();
    await resolveDeskAlert(s.actor, s.alert.id, 'KEEP_CURRENT', meta);
    expect(
      (await prisma.courtHold.findUniqueOrThrow({ where: { courtId: s.court2.id } })).umpireId,
    ).toBe(s.bram.id);
  });

  it('two resolves at the same moment: exactly one wins', async () => {
    const s = await alertSetup();
    const results = await Promise.allSettled([
      resolveDeskAlert(s.actor, s.alert.id, 'KEEP_CURRENT', meta),
      resolveDeskAlert(s.actor, s.alert.id, 'ASSIGN_RESERVE', meta),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: 'deskAlert.resolve' } })).toBe(1);
  });
});

describe('deleting matches that have umpire events', () => {
  /** A draft draw whose first match has one umpire event. */
  async function draftWithEvent() {
    const s = await setup(false);
    const anna = await umpire(s.tournament.id, 'Anna K.');
    await prisma.umpireEvent.create({
      data: {
        id: randomUUID(),
        matchId: s.match.id,
        courtId: s.court1.id,
        umpireId: anna.id,
        seq: 1,
        kind: 'POINT',
        side: 'A',
      },
    });
    return s;
  }

  it('deleting the draft is refused with a clear error and nothing is removed', async () => {
    const s = await draftWithEvent();
    await expect(deleteDraft(s.actor, s.event.id, meta)).rejects.toMatchObject({
      code: 'matchHasUmpireEvents',
      status: 409,
    });
    expect(await prisma.match.count({ where: { id: s.match.id } })).toBe(1);
  });

  it('regenerating and swapping are refused the same way', async () => {
    const s = await draftWithEvent();
    await expect(generateDraw(s.actor, s.event.id, meta, seededRng(2))).rejects.toMatchObject({
      code: 'matchHasUmpireEvents',
    });
    const entries = await prisma.drawEntry.findMany({
      where: { draw: { eventId: s.event.id } },
      take: 2,
    });
    await expect(
      swapEntries(s.actor, s.event.id, { a: entries[0]!.id, b: entries[1]!.id }, meta),
    ).rejects.toMatchObject({ code: 'matchHasUmpireEvents' });
    expect(await prisma.match.count({ where: { id: s.match.id } })).toBe(1);
  });

  it('a draft without umpire events is deleted as before', async () => {
    const s = await setup(false);
    await deleteDraft(s.actor, s.event.id, meta);
    expect(await prisma.draw.count({ where: { eventId: s.event.id } })).toBe(0);
  });
});
