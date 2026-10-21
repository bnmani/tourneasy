import { prisma, Role, type DrawType } from '@tourneasy/db';
import { seededRng } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { generateDraw, getDrawSetup, publishDraws } from './draw-service';
import {
  createKnockoutFromGroups,
  eventPodium,
  nextSwissRound,
  playerHistory,
  recordResult,
  recordWalkover,
  setCheckIn,
  stageStatus,
} from './results-service';
import {
  getSchedule,
  moveMatch,
  myMatches,
  proposeTournamentSchedule,
  publicSchedule,
  publishSchedule,
} from './schedule-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

async function setup(drawType: DrawType, n: number, extra: Record<string, unknown> = {}) {
  const venue = await prisma.venue.create({
    data: {
      name: 'Sporthal',
      slug: 'sporthal',
      street: 'Weg',
      houseNumber: '1',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: 4,
    },
  });
  const t = await prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2026-02-01'),
      entryDeadline: new Date('2026-02-01'),
      withdrawalDeadline: new Date('2026-02-01'),
      isPublished: true,
      status: 'CLOSED',
      venueId: venue.id,
      courtsAvailable: 2,
      dayStartTime: '09:00',
      dayEndTime: '18:00',
    },
  });
  const event = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'DE', feeCents: 0, drawType, ...extra },
  });
  const players = [];
  for (let i = 0; i < n; i++) {
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
    players.push({ ...p, profile });
  }
  return { t, event, players };
}

const win = {
  games: [
    [21, 10],
    [21, 12],
  ],
};

/** Plays every open match of an event with entry A winning, until nothing is ready. */
async function playAll(actor: Awaited<ReturnType<typeof admin>>, eventId: string) {
  for (;;) {
    const open = await prisma.match.findMany({
      where: {
        draw: { eventId, status: { not: 'DRAFT' } },
        status: 'SCHEDULED',
        entryA: { registrationId: { not: null } },
        entryB: { registrationId: { not: null } },
      },
    });
    if (open.length === 0) return;
    for (const m of open) await recordResult(actor, m.id, win, meta);
  }
}

describe('schedule', () => {
  it('proposes a schedule on the courts, keeps rest, publishes, and shows my matches', async () => {
    const actor = await admin();
    const { t, event, players } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await expect(proposeTournamentSchedule(actor, t.id, {}, meta)).rejects.toMatchObject({
      code: 'noPublishedDraws',
    });
    await publishDraws(actor, event.id, true, meta);
    expect(await proposeTournamentSchedule(actor, t.id, {}, meta)).toEqual({
      scheduled: 6,
      unscheduled: 0,
    });
    const schedule = await getSchedule(actor, t.id);
    expect(schedule.courts).toHaveLength(2);
    expect(schedule.conflictIds.size).toBe(0);
    // 4 players, 2 courts, 30-min slots, 20-min rest: one round per hour.
    const starts = schedule.scheduled.map((s) => s.startsAt!.toISOString().slice(11, 16));
    expect(starts).toEqual(['08:00', '08:00', '09:00', '09:00', '10:00', '10:00']);

    expect((await publicSchedule('utrecht-open', 'nl')).published).toBe(false);
    await publishSchedule(actor, t.id, true, meta);
    expect((await publicSchedule('utrecht-open', 'nl')).items).toHaveLength(6);
    const me = (await actorFromWebToken(
      (await createWebSession(players[0]!.userId, meta, true)).token,
    ))!;
    expect(await myMatches(me)).toHaveLength(3);

    // Moving a match onto a taken court is refused; to a free time it is marked as changed.
    const [first, second] = schedule.scheduled;
    await expect(
      moveMatch(
        actor,
        second!.id,
        { courtId: first!.court!.id, startsAt: '2027-03-13T09:00' },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'courtTaken' });
    await moveMatch(
      actor,
      second!.id,
      { courtId: first!.court!.id, startsAt: '2027-03-13T16:00' },
      meta,
    );
    const after = await getSchedule(actor, t.id);
    expect(after.scheduled.find((s) => s.id === second!.id)?.changed).toBe(true);
  });
});

describe('results', () => {
  it('checks scores, moves winners on and refuses a correction once the next match started', async () => {
    const actor = await admin();
    const { event } = await setup('KNOCKOUT', 4);
    await generateDraw(actor, event.id, meta, seededRng(2));
    await publishDraws(actor, event.id, true, meta);
    const r1 = await prisma.match.findMany({
      where: { round: 1 },
      orderBy: { matchNumber: 'asc' },
    });
    await expect(
      recordResult(
        actor,
        r1[0]!.id,
        {
          games: [
            [21, 20],
            [21, 5],
          ],
        },
        meta,
      ),
    ).rejects.toMatchObject({
      details: { fields: { games: 'gameScore', game: '1' } },
    });
    await recordResult(actor, r1[0]!.id, win, meta);
    await recordWalkover(actor, r1[1]!.id, { winner: 'B' }, meta);
    const final = await prisma.match.findFirstOrThrow({ where: { round: 2 } });
    expect(final.entryAId).toBe(r1[0]!.entryAId);
    expect(final.entryBId).toBe(r1[1]!.entryBId);

    // Correct round 1 while the final hasn't started: the other player moves on instead.
    await recordResult(
      actor,
      r1[0]!.id,
      {
        games: [
          [10, 21],
          [10, 21],
        ],
      },
      meta,
    );
    expect((await prisma.match.findUniqueOrThrow({ where: { id: final.id } })).entryAId).toBe(
      r1[0]!.entryBId,
    );
    await recordResult(actor, final.id, win, meta);
    await expect(recordResult(actor, r1[0]!.id, win, meta)).rejects.toMatchObject({
      code: 'nextMatchPlayed',
    });

    const podium = await eventPodium(event.id);
    expect(podium?.first).toBeTruthy();
    expect(podium?.third).toHaveLength(2);
    const winner = await prisma.drawEntry.findUniqueOrThrow({
      where: {
        id: (await prisma.match.findUniqueOrThrow({ where: { id: final.id } })).winnerEntryId!,
      },
      include: { registration: { include: { participants: true } } },
    });
    const history = await playerHistory(winner.registration!.participants[0]!.playerId);
    expect(history[0]).toMatchObject({ won: true, score: '21-10, 21-12' });
  });

  it('builds the knockout from the group tables', async () => {
    const actor = await admin();
    const { event } = await setup('GROUPS_KNOCKOUT', 8, { groupSize: 4, advancePerGroup: 2 });
    await generateDraw(actor, event.id, meta, seededRng(3));
    await publishDraws(actor, event.id, true, meta);
    await expect(createKnockoutFromGroups(actor, event.id, meta)).rejects.toMatchObject({
      code: 'stageNotFinished',
    });
    await playAll(actor, event.id);
    expect(await stageStatus(event.id)).toMatchObject({ canKnockout: true });
    await createKnockoutFromGroups(actor, event.id, meta);
    const ko = (await getDrawSetup(actor, event.id)).draws.find((d) => d.stage === 'KNOCKOUT')!;
    expect(ko.size).toBe(4);
    // Group winners are seeded and meet the other group's runner-up.
    expect(
      ko.entries
        .filter((e) => e.seed)
        .map((e) => e.seed)
        .sort(),
    ).toEqual([1, 2]);
    await playAll(actor, event.id);
    expect((await eventPodium(event.id))?.first).toBeTruthy();
  });

  it('pairs Swiss rounds from the standings without rematches', async () => {
    const actor = await admin();
    const { event } = await setup('SWISS', 6);
    await generateDraw(actor, event.id, meta, seededRng(4));
    await publishDraws(actor, event.id, true, meta);
    for (let round = 1; round <= 3; round++) {
      await playAll(actor, event.id);
      if (round < 3) await nextSwissRound(actor, event.id, meta);
    }
    await expect(nextSwissRound(actor, event.id, meta)).rejects.toMatchObject({
      code: 'stageExists',
    });
    const matches = await prisma.match.findMany({ where: { draw: { eventId: event.id } } });
    const pairs = matches.map((m) => [m.entryAId, m.entryBId].sort().join('|'));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect((await eventPodium(event.id))?.first).toBeTruthy();
  });

  it('checks players in at the desk', async () => {
    const actor = await admin();
    const { players } = await setup('KNOCKOUT', 2);
    const participant = await prisma.registrationParticipant.findFirstOrThrow({
      where: { playerId: players[0]!.profile.id },
    });
    await setCheckIn(actor, participant.id, true, meta);
    expect(
      (await prisma.registrationParticipant.findUniqueOrThrow({ where: { id: participant.id } }))
        .checkedInAt,
    ).not.toBeNull();
  });
});
