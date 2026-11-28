import { randomUUID } from 'node:crypto';
import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/test/db';
import { publicMatch } from '../lib/public-match';
import { liveMatches, publicSchedule } from './schedule-service';

beforeEach(resetDatabase);

let n = 0;
/** A published tournament on 2027-03-13 with one match on court 1 and one umpire. */
async function setup(
  status: 'IN_PROGRESS' | 'AWAITING_DESK' | 'COMPLETED',
  startServer: 'A' | 'B' | null = 'B',
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
      numberOfCourts: 1,
    },
  });
  const tournament = await prisma.tournament.create({
    data: {
      name: `Toernooi ${n}`,
      slug: `toernooi-${n}`,
      venueId: venue.id,
      isPublished: true,
      schedulePublishedAt: new Date('2027-03-01'),
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-02-01'),
      entryDeadline: new Date('2027-02-01'),
      withdrawalDeadline: new Date('2027-02-01'),
    },
  });
  const court = await prisma.court.create({ data: { venueId: venue.id, number: 1 } });
  const event = await prisma.tournamentEvent.create({
    data: {
      tournamentId: tournament.id,
      discipline: 'DE',
      feeCents: 0,
      bestOf: 1,
      pointsToWin: 21,
      pointsCap: 30,
    },
  });
  const draw = await prisma.draw.create({
    data: { eventId: event.id, type: 'KNOCKOUT', size: 2, status: 'PUBLISHED' },
  });
  const match = await prisma.match.create({
    data: {
      drawId: draw.id,
      round: 1,
      matchNumber: 1,
      status,
      umpireStartServer: startServer,
    },
  });
  await prisma.courtSlot.create({
    data: {
      tournamentId: tournament.id,
      courtId: court.id,
      matchId: match.id,
      startsAt: new Date('2027-03-13T09:00:00Z'),
      endsAt: new Date('2027-03-13T10:00:00Z'),
    },
  });
  const umpire = await prisma.umpire.create({
    data: {
      tournamentId: tournament.id,
      displayName: 'Anna Umpire',
      pinHash: `pin-${n}`,
      qrTokenHash: `qr-${n}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const points = async (sides: ('A' | 'B')[]) => {
    let seq = 0;
    for (const side of sides) {
      seq += 1;
      await prisma.umpireEvent.create({
        data: {
          id: randomUUID(),
          matchId: match.id,
          courtId: court.id,
          umpireId: umpire.id,
          seq,
          kind: 'POINT',
          side,
        },
      });
    }
  };
  return { tournament, match, umpire, court, points };
}

const now = new Date('2027-03-13T09:30:00Z');

describe('live fields', () => {
  it('a match in progress shows the replayed score and the server', async () => {
    const s = await setup('IN_PROGRESS', 'B');
    await s.points(['A', 'A', 'B']);
    const schedule = await publicSchedule(s.tournament.slug, 'nl');
    expect(schedule.items[0]).toMatchObject({ games: [[2, 1]], serving: 'B' });
    const live = await liveMatches('nl', s.tournament.slug, now);
    expect(live[0]!.onCourt[0]).toMatchObject({ games: [[2, 1]], serving: 'B' });
    expect(publicMatch(schedule.items[0]!)).toMatchObject({ games: [[2, 1]], serving: 'B' });
  });

  it('the start server shows before the first point', async () => {
    const s = await setup('IN_PROGRESS', 'B');
    const schedule = await publicSchedule(s.tournament.slug, 'nl');
    expect(schedule.items[0]).toMatchObject({ games: [], serving: 'B' });
  });

  it('no start server: serving and games are null, never a guessed A', async () => {
    const s = await setup('IN_PROGRESS', null);
    await s.points(['A', 'A', 'B']);
    const schedule = await publicSchedule(s.tournament.slug, 'nl');
    expect(schedule.items[0]!.serving).toBeNull();
    expect(schedule.items[0]!.games).toBeNull();
    const live = await liveMatches('nl', s.tournament.slug, now);
    expect(live[0]!.onCourt[0]).toMatchObject({ games: null, serving: null });
  });

  it('a match awaiting the desk still shows the umpire score', async () => {
    const s = await setup('AWAITING_DESK', 'A');
    await s.points(['B', 'B']);
    const schedule = await publicSchedule(s.tournament.slug, 'nl');
    expect(schedule.items[0]).toMatchObject({
      status: 'AWAITING_DESK',
      games: [[0, 2]],
      serving: 'B',
    });
  });

  it('a completed match shows the confirmed MatchSet score, not the umpire log', async () => {
    const s = await setup('COMPLETED', 'A');
    await s.points(['A', 'A', 'A']);
    await prisma.matchSet.createMany({
      data: [{ matchId: s.match.id, setNumber: 1, scoreA: 21, scoreB: 19 }],
    });
    const schedule = await publicSchedule(s.tournament.slug, 'nl');
    expect(schedule.items[0]).toMatchObject({
      status: 'COMPLETED',
      games: [[21, 19]],
      serving: null,
    });
  });

  it('exposes no umpire identity or event id', async () => {
    const s = await setup('IN_PROGRESS', 'A');
    await s.points(['A', 'B']);
    const schedule = await publicSchedule(s.tournament.slug, 'nl');
    const live = await liveMatches('nl', s.tournament.slug, now);
    const json = JSON.stringify([
      schedule.items.map(publicMatch),
      live[0]!.onCourt.map(publicMatch),
    ]);
    const events = await prisma.umpireEvent.findMany();
    for (const secret of [
      s.umpire.id,
      s.umpire.displayName,
      s.umpire.pinHash,
      s.umpire.qrTokenHash,
      ...events.map((e) => e.id),
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toMatch(/umpire/i);
  });
});
