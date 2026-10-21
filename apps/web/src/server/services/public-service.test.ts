import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { publicJson } from '../lib/http-cache';
import { tournamentIcs } from '../lib/ics';
import {
  calendarTournaments,
  decodeCursor,
  encodeCursor,
  followPlayer,
  getPublicClub,
  getPublicPlayer,
  getPublicTournament,
  listFollowing,
  listPublicPlayers,
  listPublicTournaments,
  unfollowPlayer,
} from './public-service';
import { actorFromWebToken, createWebSession, type Actor } from './session-service';

beforeEach(resetDatabase);

const NOW = new Date('2026-12-01T12:00:00Z');

async function actorFor(userId: string): Promise<Actor> {
  const { token } = await createWebSession(userId, meta, true);
  return (await actorFromWebToken(token))!;
}

async function tournament(name: string, overrides: Record<string, unknown> = {}) {
  const venue = await prisma.venue.upsert({
    where: { slug: 'sporthal-utrecht' },
    update: {},
    create: {
      name: 'Sporthal De Shuttle',
      slug: 'sporthal-utrecht',
      street: 'Shuttleweg',
      houseNumber: '12',
      postcode: '3511 AB',
      city: 'Utrecht',
      province: 'UTRECHT',
      numberOfCourts: 6,
    },
  });
  return prisma.tournament.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      venueId: venue.id,
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
      registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
      entryDeadline: new Date('2027-02-27T22:59:00Z'),
      withdrawalDeadline: new Date('2027-02-20T22:59:00Z'),
      status: 'OPEN',
      isPublished: true,
      events: {
        create: [
          { discipline: 'HD', feeCents: 1500 },
          { discipline: 'GD', feeCents: 1750 },
        ],
      },
      ...overrides,
    },
  });
}

describe('public tournaments', () => {
  it('lists only published, live tournaments with phase, fees and disciplines', async () => {
    await tournament('Utrecht Open');
    await tournament('Secret Cup', { isPublished: false });
    await tournament('Old Cup', {
      startsOn: new Date('2026-05-01'),
      endsOn: new Date('2026-05-01'),
    });
    await tournament('Deleted Cup', { deletedAt: new Date() });

    const upcoming = await listPublicTournaments({}, undefined, NOW);
    expect(upcoming.data.map((t) => t.name)).toEqual(['Utrecht Open']);
    expect(upcoming.data[0]).toMatchObject({
      phase: 'registrationOpen',
      disciplines: ['HD', 'GD'],
      feeFromCents: 1500,
      feeToCents: 1750,
      venue: { city: 'Utrecht', province: 'UTRECHT' },
    });

    const past = await listPublicTournaments({ when: 'past' }, undefined, NOW);
    expect(past.data.map((t) => t.name)).toEqual(['Old Cup']);
    expect(past.data[0]!.phase).toBe('finished');

    expect((await listPublicTournaments({ discipline: 'DE' }, undefined, NOW)).total).toBe(0);
    expect((await listPublicTournaments({ q: 'utrecht open' }, undefined, NOW)).total).toBe(1);
    expect((await listPublicTournaments({ province: 'LIMBURG' }, undefined, NOW)).total).toBe(0);
    expect((await calendarTournaments(12, NOW)).map((t) => t.name)).toEqual(['Utrecht Open']);
  });

  it('shows details of published tournaments only', async () => {
    await tournament('Utrecht Open');
    await tournament('Secret Cup', { isPublished: false });
    const t = await getPublicTournament('utrecht-open', NOW);
    expect(t.events.map((e) => e.discipline)).toEqual(['HD', 'GD']);
    expect(t.venue?.street).toBe('Shuttleweg');
    await expect(getPublicTournament('secret-cup', NOW)).rejects.toMatchObject({
      code: 'notFound',
    });

    const ics = tournamentIcs(t, new Request('https://test.example/x'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20270313');
    expect(ics).toContain('DTEND;VALUE=DATE:20270315');
    expect(ics).toContain('SUMMARY:Utrecht Open');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it('pages with an opaque cursor and rejects forged ones', async () => {
    await tournament('A Cup');
    await tournament('B Cup');
    const first = await listPublicTournaments({ limit: 1 }, undefined, NOW);
    expect(first.data[0]!.name).toBe('A Cup');
    const second = await listPublicTournaments(
      { limit: 1, cursor: first.nextCursor },
      undefined,
      NOW,
    );
    expect(second.data[0]!.name).toBe('B Cup');
    expect(second.nextCursor).toBeNull();
    expect(decodeCursor(encodeCursor(40))).toBe(40);
    expect(() => decodeCursor('bm9wZQ')).toThrow();
  });
});

describe('public players', () => {
  it('shows only adults who opted in, and lets others follow them', async () => {
    const shown = await createPlayer({ firstName: 'Anna', lastName: 'Peters' });
    const hidden = await createPlayer({ firstName: 'Bram', lastName: 'Verborgen' });
    // Sign-up asks under-16s for parental consent; make one directly.
    const minor = await createPlayer({ firstName: 'Kim' });
    await prisma.playerProfile.update({
      where: { userId: minor.userId },
      data: { dateOfBirth: new Date('2014-05-01') },
    });
    await prisma.playerProfile.updateMany({
      where: { userId: { in: [shown.userId, minor.userId] } },
      data: { publicProfile: true },
    });

    const list = await listPublicPlayers({});
    expect(list.data.map((p) => p.name)).toEqual(['Anna Peters']);
    expect(list.data[0]).not.toHaveProperty('email');
    expect((await listPublicPlayers({ q: 'peters anna' })).total).toBe(1);

    const anna = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: shown.userId } });
    const bram = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: hidden.userId } });
    await expect(getPublicPlayer(bram.memberNumber)).rejects.toMatchObject({ code: 'notFound' });

    const fan = await actorFor(hidden.userId);
    await followPlayer(fan, anna.memberNumber.toLowerCase());
    await followPlayer(fan, anna.memberNumber); // idempotent
    expect(await getPublicPlayer(anna.memberNumber, fan)).toMatchObject({
      following: true,
      isSelf: false,
      player: { followerCount: 1 },
    });
    expect((await listFollowing(fan)).map((p) => p.name)).toEqual(['Anna Peters']);
    await unfollowPlayer(fan, anna.memberNumber);
    expect(await listFollowing(fan)).toEqual([]);

    const self = await actorFor(shown.userId);
    await expect(followPlayer(self, anna.memberNumber)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(followPlayer(self, bram.memberNumber)).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('lists a club with its public players only', async () => {
    const club = await prisma.club.create({ data: { name: 'BC Smash', slug: 'bc-smash' } });
    const a = await createPlayer({ firstName: 'Anna' });
    const b = await createPlayer({ firstName: 'Bram' });
    await prisma.playerProfile.update({
      where: { userId: a.userId },
      data: { publicProfile: true, clubId: club.id },
    });
    await prisma.playerProfile.update({ where: { userId: b.userId }, data: { clubId: club.id } });
    const result = await getPublicClub('bc-smash');
    expect(result.club.publicPlayerCount).toBe(1);
    expect(result.players.map((p) => p.name.split(' ')[0])).toEqual(['Anna']);
  });
});

describe('publicJson', () => {
  it('sends an ETag and answers 304 when it matches', async () => {
    const first = publicJson(new Request('https://x.test/a'), { a: 1 });
    const etag = first.headers.get('etag')!;
    expect(first.headers.get('cache-control')).toContain('public');
    const second = publicJson(
      new Request('https://x.test/a', { headers: { 'if-none-match': etag } }),
      { a: 1 },
    );
    expect(second.status).toBe(304);
  });
});
