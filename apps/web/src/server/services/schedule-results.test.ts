import { prisma, Role, type DrawType } from '@tourneasy/db';
import { seededRng } from '@tourneasy/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { generateDraw, getDrawSetup, publishDraws } from './draw-service';
import {
  createKnockoutFromGroups,
  eventPodium,
  nextSwissRound,
  playerHistory,
  recordResult,
  recordWalkover,
  removeKnockoutStage,
  removeLastSwissRound,
  startMatch,
  unstartMatch,
  setCheckIn,
  stageStatus,
} from './results-service';
import {
  deskMatches,
  getSchedule,
  moveMatch,
  myMatches,
  proposeTournamentSchedule,
  publicSchedule,
  publishSchedule,
  roundLabel,
  unscheduleMatch,
} from './schedule-service';
import { followedMatches, upcomingMatchesOf } from './public-service';
import {
  expectedKnockout,
  expectedKnockoutOfPlayers,
  publicExpectedKnockout,
  setExpectedKnockout,
} from './expected-knockout-service';
import { setSemiPairing, swapSemiTeams } from './semi-pairing-service';
import { PDFDocument } from 'pdf-lib';
import { buildSchedulePdf, pdfSafe } from '../pdf/schedule-pdf';
import { checkInList, checkInPdf, payAtDesk, setPlayerCheckIn } from './checkin-service';
import { courtsPdf, schedulePdf, scheduleXlsx } from './schedule-pdf-service';
import { strFromU8, unzipSync } from 'fflate';
import { readXlsx } from '../lib/xlsx';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function owner() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.OWNER } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

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

/** Every unfinished match at the desk: on court, ready, and still waiting for players. */
async function openDesk(
  actor: Parameters<typeof deskMatches>[0],
  tournamentId: string,
  locale?: Parameters<typeof deskMatches>[3],
) {
  const [now, next] = await Promise.all([
    deskMatches(actor, tournamentId, 'now', locale),
    deskMatches(actor, tournamentId, 'next', locale),
  ]);
  return { items: [...now.items, ...next.items, ...next.waiting] };
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
    expect(after.scheduled.find((s) => s.id === second!.id)?.changed).toBe('changed');
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
    // Prizes for the top 2 only: no third place.
    await prisma.tournamentEvent.update({ where: { id: event.id }, data: { prizePlaces: 2 } });
    expect((await eventPodium(event.id))?.third).toEqual([]);
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
    const { t, event } = await setup('GROUPS_KNOCKOUT', 8, { groupSize: 4, advancePerGroup: 2 });
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
    // Match numbers are unique across both groups and the knockout (no two "#1"s at the desk).
    const desk = await openDesk(
      actor,
      (await prisma.tournamentEvent.findUniqueOrThrow({ where: { id: event.id } })).tournamentId,
      'en',
    );
    const numbers = desk.items.map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(desk.items.find((i) => i.a === null || i.a.startsWith('Winner #'))).toBeTruthy();

    // Made after a wrong group result (D99): remove it while unplayed, then make it again.
    expect(await stageStatus(event.id)).toMatchObject({ canRemoveKnockout: true });
    await removeKnockoutStage(actor, event.id, meta);
    expect(await prisma.draw.count({ where: { eventId: event.id, stage: 'KNOCKOUT' } })).toBe(0);
    expect(await stageStatus(event.id)).toMatchObject({ canKnockout: true });
    await createKnockoutFromGroups(actor, event.id, meta);

    // A match goes on court only with a court and time (D126).
    await proposeTournamentSchedule(actor, t.id, { mode: 'remaining' }, meta);
    // A match put on court by mistake goes back to waiting while no score is in.
    const first = await prisma.match.findFirstOrThrow({
      where: {
        draw: { eventId: event.id, stage: 'KNOCKOUT' },
        entryAId: { not: null },
        entryBId: { not: null },
        status: 'SCHEDULED',
      },
    });
    await startMatch(actor, first.id, meta);
    await unstartMatch(actor, first.id, meta);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      status: 'SCHEDULED',
      startedAt: null,
    });
    await startMatch(actor, first.id, meta);
    expect(await stageStatus(event.id)).toMatchObject({ canRemoveKnockout: false });
    await expect(removeKnockoutStage(actor, event.id, meta)).rejects.toMatchObject({
      code: 'drawStarted',
    });
    await unstartMatch(actor, first.id, meta);
    await playAll(actor, event.id);
    expect((await eventPodium(event.id))?.first).toBeTruthy();
  });

  it('removes an unplayed Swiss round and pairs it again (D99)', async () => {
    const actor = await admin();
    const { event } = await setup('SWISS', 6);
    await generateDraw(actor, event.id, meta, seededRng(4));
    await publishDraws(actor, event.id, true, meta);
    await expect(removeLastSwissRound(actor, event.id, meta)).rejects.toMatchObject({
      code: 'statusTransition',
    });
    await playAll(actor, event.id);
    await nextSwissRound(actor, event.id, meta);
    expect(await stageStatus(event.id)).toMatchObject({ canRemoveSwissRound: true });
    await removeLastSwissRound(actor, event.id, meta);
    expect(await prisma.match.count({ where: { draw: { eventId: event.id }, round: 2 } })).toBe(0);
    await nextSwissRound(actor, event.id, meta);
    expect(await prisma.match.count({ where: { draw: { eventId: event.id }, round: 2 } })).toBe(3);
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
    // Round 3 is played: it can't be removed (D99).
    await expect(removeLastSwissRound(actor, event.id, meta)).rejects.toMatchObject({
      code: 'drawStarted',
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

describe('scoring per stage (D61)', () => {
  it('accepts 1 game in the groups and needs best of 3 in the knockout', async () => {
    const actor = await admin();
    const { event } = await setup('GROUPS_KNOCKOUT', 4, {
      groupSize: 4,
      advancePerGroup: 2,
      bestOf: 1,
      koScoringFrom: 'KO',
      koBestOf: 3,
      koPointsToWin: 21,
      koPointsCap: 30,
    });
    await generateDraw(actor, event.id, meta, seededRng(9));
    await publishDraws(actor, event.id, true, meta);
    const groupMatches = await prisma.match.findMany({ where: { draw: { eventId: event.id } } });
    for (const m of groupMatches) await recordResult(actor, m.id, { games: [[21, 15]] }, meta);
    await createKnockoutFromGroups(actor, event.id, meta);
    const semi = await prisma.match.findFirstOrThrow({
      where: { draw: { eventId: event.id, stage: 'KNOCKOUT' }, round: 1 },
    });
    await expect(recordResult(actor, semi.id, { games: [[21, 15]] }, meta)).rejects.toMatchObject({
      details: { fields: { games: 'tooFewGames' } },
    });
    await recordResult(
      actor,
      semi.id,
      {
        games: [
          [21, 15],
          [18, 21],
          [21, 19],
        ],
      },
      meta,
    );
  });
});

describe('round names (schedule and desk)', () => {
  const row = (draw: Record<string, unknown>, match: Record<string, unknown> = {}) =>
    ({ bracket: 'W', round: 1, ...match, draw: { name: null, stage: 'MAIN', ...draw } }) as never;
  it('says which stage and knockout round a match is in', () => {
    const ko = (size: number, round: number) =>
      roundLabel(row({ type: 'KNOCKOUT', size }, { round }), 'nl');
    expect([ko(32, 1), ko(32, 2), ko(32, 3), ko(32, 4), ko(32, 5)]).toEqual([
      'Laatste 32',
      'Achtste finale',
      'Kwartfinale',
      'Halve finale',
      'Finale',
    ]);
    expect(roundLabel(row({ type: 'KNOCKOUT', size: 64 }), 'en')).toBe('Round of 64');
    expect(roundLabel(row({ type: 'GROUPS_KNOCKOUT', stage: 'GROUP', name: 'A' }), 'nl')).toBe(
      'Poule A · ronde 1',
    );
    expect(roundLabel(row({ type: 'ROUND_ROBIN' }, { round: 2 }), 'nl')).toBe('Poule · ronde 2');
    expect(roundLabel(row({ type: 'HYBRID_ROUND_ROBIN_KNOCKOUT' }), 'nl')).toBe(
      'Voorronde · ronde 1',
    );
    expect(roundLabel(row({ type: 'SWISS' }, { round: 3 }), 'en')).toBe('Swiss system · round 3');
  });
});

describe('schedule PDF (D73)', () => {
  it('is for managers before publishing (draft) and for everyone after', async () => {
    const actor = await admin();
    const { t, event } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    await expect(schedulePdf(null, t.slug, 'nl')).rejects.toMatchObject({ code: 'notFound' });
    const draft = await schedulePdf(actor, t.slug, 'nl');
    expect(draft.filename).toBe('speelschema-utrecht-open.pdf');
    expect(Buffer.from(draft.bytes).subarray(0, 5).toString()).toBe('%PDF-');
    await publishSchedule(actor, t.id, true, meta);
    const pub = await schedulePdf(null, t.slug, 'en');
    expect(pub.filename).toBe('schedule-utrecht-open.pdf');
    expect((await PDFDocument.load(pub.bytes)).getTitle()).toBe('Match schedule – Utrecht Open');
  });

  it('runs over several pages and copes with any name', async () => {
    expect(pdfSafe('Zoë Łukasz Nguyễn 🏸')).toBe('Zoë Lukasz Nguyen ?');
    const start = new Date('2027-03-13T08:00:00Z');
    const bytes = await buildSchedulePdf({
      locale: 'nl',
      tournament: { name: 'Utrecht Open', when: '13 maart', venue: null, url: 'https://x.test' },
      logo: null,
      draft: false,
      generatedAt: start,
      matches: Array.from({ length: 120 }, (_, i) => ({
        number: i + 1,
        event: 'Gemengd dubbel · Senioren · B',
        round: 'Poule A · ronde 1',
        a: 'Łukasz Kowalski / Zoë de Vries-van den Berg',
        b: null,
        startsAt: new Date(start.getTime() + Math.floor(i / 6) * 1_800_000),
        court: { number: (i % 6) + 1, name: null },
        status: 'SCHEDULED',
        sets: [],
      })),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });
});

describe('schedule Excel and per court (D79)', () => {
  it('exports an Excel sheet per day plus all, and a court PDF for managers', async () => {
    const actor = await admin();
    const { t, event } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    await expect(scheduleXlsx(null, t.slug, 'nl')).rejects.toMatchObject({ code: 'notFound' });
    await publishSchedule(actor, t.id, true, meta);

    const xlsx = await scheduleXlsx(null, t.slug, 'nl');
    expect(xlsx.filename).toBe('speelschema-utrecht-open.xlsx');
    const rows = readXlsx(xlsx.bytes)!; // the first sheet: everything
    expect(rows[0]).toEqual([
      'Datum',
      'Tijd',
      'Baan',
      'Nr.',
      'Onderdeel',
      'Ronde',
      'Speler(s) A',
      'Club A',
      'Speler(s) B',
      'Club B',
      'Uitslag',
      'Status',
    ]);
    expect(rows.length - 1).toBe(6); // 4 players round robin
    const times = rows.slice(1).map((r) => `${r[0]} ${r[1]}`);
    expect(times).toEqual([...times].sort());
    expect(rows[1]![11]).toBe('Gepland');

    // A match without a time and court (taken out of the planning, or played without
    // one) is still exported: last in "Alles" and on a sheet of its own.
    const out = await prisma.match.findFirstOrThrow({ where: { slot: { isNot: null } } });
    await unscheduleMatch(actor, out.id, meta);
    // The public schedule lists it too, under "without time or court".
    const pub = await publicSchedule(t.slug, 'nl');
    expect(pub.items).toHaveLength(5);
    expect(pub.unplanned.map((i) => i.id)).toEqual([out.id]);
    const again = await scheduleXlsx(null, t.slug, 'nl');
    const all = readXlsx(again.bytes)!;
    expect(all.length - 1).toBe(6);
    expect(all.at(-1)!.slice(0, 3)).toEqual(['', '', '']);
    expect(strFromU8(unzipSync(again.bytes)['xl/workbook.xml']!)).toContain(
      'name="Zonder tijd en baan"',
    );
    const pdf = await schedulePdf(null, t.slug, 'nl');
    expect(Buffer.from(pdf.bytes).length).toBeGreaterThan(1000);

    // Per court: managers only, even once published.
    await expect(courtsPdf(null, t.slug, 'nl')).rejects.toMatchObject({ code: 'notFound' });
    const courts = await courtsPdf(actor, t.slug, 'en');
    expect(courts.filename).toBe('courts-utrecht-open.pdf');
    expect((await PDFDocument.load(courts.bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe('my schedule and players I follow (D81)', () => {
  it('shows coming matches of published schedules to me and my followers', async () => {
    const actor = await admin();
    const { t, event, players } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    const anna = players[0]!;
    await prisma.playerProfile.update({
      where: { id: anna.profile.id },
      data: { publicProfile: true },
    });
    const fan = await createPlayer();
    const fanActor = (await actorFromWebToken(
      (await createWebSession(fan.userId, meta, true)).token,
    ))!;
    await prisma.playerFollow.create({
      data: { followerUserId: fan.userId, followedPlayerId: anna.profile.id },
    });
    // Not published yet: nothing for anyone.
    expect(await followedMatches(fanActor)).toEqual([]);
    expect(await upcomingMatchesOf(anna.profile.memberNumber, 'nl')).toEqual([]);

    await publishSchedule(actor, t.id, true, meta);
    const followed = await followedMatches(fanActor);
    expect(followed.map((p) => [p.memberNumber, p.matches.length])).toEqual([
      [anna.profile.memberNumber, 3],
    ]);
    expect(await upcomingMatchesOf(anna.profile.memberNumber, 'nl')).toHaveLength(3);
    const annaActor = (await actorFromWebToken(
      (await createWebSession(anna.userId, meta, true)).token,
    ))!;
    const mine = await myMatches(annaActor);
    expect(mine).toHaveLength(3);
    expect(mine.map((m) => m.startsAt!.getTime())).toEqual(
      [...mine.map((m) => m.startsAt!.getTime())].sort((a, b) => a - b),
    );
  });
});

describe('under-16s on public pages (D83)', () => {
  it('shows first name and initial publicly, the full name in the portal', async () => {
    const actor = await admin();
    const { t, event, players } = await setup('ROUND_ROBIN', 4);
    const kid = players[0]!.profile;
    await prisma.playerProfile.update({
      where: { id: kid.id },
      data: { dateOfBirth: new Date(Date.now() - 12 * 365 * 86_400_000) },
    });
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    await publishSchedule(actor, t.id, true, meta);

    const full = `${kid.firstName} ${kid.lastName}`;
    const short = `${kid.firstName} ${kid.lastName.charAt(0).toUpperCase()}.`;
    const names = (items: { a: string | null; b: string | null }[]) =>
      items.flatMap((i) => [i.a, i.b]);
    const pub = names((await publicSchedule(t.slug, 'nl')).items);
    expect(pub).toContain(short);
    expect(pub).not.toContain(full);
    expect(names((await getSchedule(actor, t.id, 'nl')).scheduled)).toContain(full);
    // Exports: short for the public, full for the organisers.
    const anon = readXlsx((await scheduleXlsx(null, t.slug, 'nl')).bytes)!.flat();
    expect(anon).toContain(short);
    expect(readXlsx((await scheduleXlsx(actor, t.slug, 'nl')).bytes)!.flat()).toContain(full);
  });
});

describe('desk check-in (D74)', () => {
  afterEach(() => vi.useRealTimers());

  it('lists the day, checks a player in for all matches that day, and takes payment', async () => {
    const actor = await admin();
    const { t, event, players } = await setup('ROUND_ROBIN', 4, { feeCents: 1250 });
    // Nothing scheduled yet: every entrant is on the list.
    expect((await checkInList(actor, t.id, '2027-03-13')).players).toHaveLength(4);

    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    const day1 = await checkInList(actor, t.id, '2027-03-13');
    expect(day1.days).toEqual(['2027-03-13', '2027-03-14']);
    expect(day1.players.map((p) => [p.matches, p.present, p.unpaidCents])).toEqual(
      Array(4).fill([3, false, 1250]),
    );
    expect((await checkInList(actor, t.id, '2027-03-14')).players).toHaveLength(0);
    // First match first; the same time by first name.
    const order = day1.players.map((p) => [p.firstMatch!.getTime(), p.name]);
    expect(order).toEqual(
      [...order].sort(
        (a, b) =>
          (a[0] as number) - (b[0] as number) || String(a[1]).localeCompare(String(b[1]), 'nl'),
      ),
    );
    const pdf = await checkInPdf(actor, t.id, '2027-03-13', 'nl');
    expect(pdf.filename).toMatch(/^aanmeldlijst-.*-2027-03-13\.pdf$/);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);

    // On the day itself: one tap for all of the player's matches.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-03-13T08:30:00Z'));
    const anna = players[0]!.profile.id;
    await setPlayerCheckIn(actor, t.id, anna, true, meta);
    const list = await checkInList(actor, t.id, '2027-03-13');
    expect(list.players.find((p) => p.playerId === anna)?.present).toBe(true);
    const desk = await openDesk(actor, t.id);
    const annaShare = await prisma.registrationParticipant.findFirstOrThrow({
      where: { playerId: anna },
    });
    const annaSides = desk.items
      .flatMap((i) => i.checkIn.flat())
      .filter((p) => p.id === annaShare.id);
    expect(annaSides.length).toBe(3);
    expect(annaSides.every((p) => p.checkedIn)).toBe(true);

    // Pay at the desk: everything open at once, then nothing left.
    expect(await payAtDesk(actor, t.id, anna, meta)).toBe(1);
    expect(
      (await checkInList(actor, t.id, '2027-03-13')).players.find((p) => p.playerId === anna)
        ?.unpaidCents,
    ).toBe(0);
    await expect(payAtDesk(actor, t.id, anna, meta)).rejects.toMatchObject({
      code: 'statusTransition',
    });

    // The evening before the first day counts for that day (later days start fresh).
    vi.setSystemTime(new Date('2027-03-12T18:00:00Z'));
    const bram = players[1]!.profile.id;
    await setPlayerCheckIn(actor, t.id, bram, true, meta);
    expect(
      (await checkInList(actor, t.id, '2027-03-13')).players.find((p) => p.playerId === bram)
        ?.present,
    ).toBe(true);
  });
});

describe('on court (D116)', () => {
  it('keeps a busy player and a busy court off court until the result is in', async () => {
    const actor = await admin();
    const { t, event } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    const matches = await prisma.match.findMany({
      where: { draw: { eventId: event.id } },
      include: {
        slot: true,
        entryA: { include: { registration: { include: { participants: true } } } },
        entryB: { include: { registration: { include: { participants: true } } } },
      },
      orderBy: [{ slot: { startsAt: 'asc' } }, { matchNumber: 'asc' }],
    });
    const playersOf = (m: (typeof matches)[number]) =>
      [m.entryA, m.entryB].flatMap((e) => e!.registration!.participants.map((p) => p.playerId));
    const [first, other] = matches as [(typeof matches)[number], (typeof matches)[number]];
    const sharing = matches.find(
      (m) => m.id !== first.id && playersOf(m).some((p) => playersOf(first).includes(p)),
    )!;
    await startMatch(actor, first.id, meta);

    // A player of the first match is still on court: refused, and the desk says where.
    await expect(startMatch(actor, sharing.id, meta)).rejects.toMatchObject({
      code: 'playerOnCourt',
    });
    const court = (await prisma.court.findUniqueOrThrow({ where: { id: first.slot!.courtId } }))
      .number;
    const desk = await openDesk(actor, t.id);
    const waiting = desk.items.find((i) => i.id === sharing.id)!;
    expect(waiting.busy?.players.map((p) => p.court)).toEqual([court]);
    expect(desk.items.find((i) => i.id === first.id)?.busy).toBeNull();

    // The other pair moved later onto the busy court: that court is still in use.
    await prisma.courtSlot.update({
      where: { matchId: other.id },
      data: {
        courtId: first.slot!.courtId,
        startsAt: new Date(first.slot!.endsAt.getTime() + 60 * 60_000),
        endsAt: new Date(first.slot!.endsAt.getTime() + 90 * 60_000),
      },
    });
    expect((await openDesk(actor, t.id)).items.find((i) => i.id === other.id)?.busy).toMatchObject({
      players: [],
      courtMatch: expect.any(Number),
    });
    await expect(startMatch(actor, other.id, meta)).rejects.toMatchObject({ code: 'courtInUse' });

    // The result frees both.
    await recordResult(actor, first.id, win, meta);
    expect((await openDesk(actor, t.id)).items.every((i) => !i.busy)).toBe(true);
    await startMatch(actor, other.id, meta);
    // In a round robin every later match has a player of the pair now on court.
    await expect(startMatch(actor, sharing.id, meta)).rejects.toMatchObject({
      code: 'playerOnCourt',
    });
    await recordResult(actor, other.id, win, meta);
    await startMatch(actor, sharing.id, meta);
  });
});

describe('court times left behind by a removed draw (D118)', () => {
  it('plans the remaining matches although old court times without a match are still there', async () => {
    const actor = await admin();
    const { t, event } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    // The draw was made again: its matches are gone, their court times stay without a match.
    const slots = await prisma.courtSlot.findMany({ where: { tournamentId: t.id } });
    await prisma.courtSlot.updateMany({ where: { tournamentId: t.id }, data: { matchId: null } });
    expect(await prisma.courtSlot.count({ where: { tournamentId: t.id, matchId: null } })).toBe(
      slots.length,
    );

    expect(await proposeTournamentSchedule(actor, t.id, { mode: 'remaining' }, meta)).toEqual({
      scheduled: 6,
      unscheduled: 0,
    });
    expect(await prisma.courtSlot.count({ where: { tournamentId: t.id, matchId: null } })).toBe(0);

    // Moving a match by hand isn't blocked by such a time either.
    const [match] = await prisma.match.findMany({
      where: { draw: { eventId: event.id } },
      take: 1,
    });
    const court = await prisma.court.findFirstOrThrow({
      where: { venue: { tournaments: { some: { id: t.id } } } },
    });
    await prisma.courtSlot.create({
      data: {
        tournamentId: t.id,
        courtId: court.id,
        startsAt: new Date('2027-03-13T16:00:00Z'),
        endsAt: new Date('2027-03-13T16:30:00Z'),
      },
    });
    await moveMatch(actor, match!.id, { courtId: court.id, startsAt: '2027-03-13T17:00' }, meta);
    expect(await prisma.courtSlot.count({ where: { tournamentId: t.id, matchId: null } })).toBe(0);
  });
});

describe('expected knockout rounds (D121)', () => {
  async function hybrid(extra: Record<string, unknown> = {}) {
    const actor = await admin();
    const made = await setup('HYBRID_ROUND_ROBIN_KNOCKOUT', 8, { knockoutSize: 4, ...extra });
    await generateDraw(actor, made.event.id, meta, seededRng(2));
    await publishDraws(actor, made.event.id, true, meta);
    await proposeTournamentSchedule(actor, made.t.id, {}, meta);
    return { actor, ...made };
  }

  it('places the semi-finals and final after the group stage, with who meets whom', async () => {
    const { t, event } = await hybrid();
    const [category] = await expectedKnockout(t.id, 'en');
    expect(category).toMatchObject({ eventId: event.id });
    expect(category!.rounds.map((r) => r.name)).toEqual(['Semi-final', 'Final']);
    // Paired by ranking (D123): 1 vs 4 and 2 vs 3, with 1 and 2 on opposite sides.
    expect(category!.rounds[0]!.matches).toEqual([
      { a: '1st', b: '4th' },
      { a: '2nd', b: '3rd' },
    ]);
    expect(category!.rounds[1]!.matches).toEqual([{ a: 'Winners of the round before', b: null }]);
    // Not before the last group match is over, and the final after the semi-finals.
    const lastGroupEnd = Math.max(
      ...(await prisma.courtSlot.findMany({ where: { tournamentId: t.id } })).map((s) =>
        s.endsAt.getTime(),
      ),
    );
    expect(category!.rounds[0]!.from.getTime()).toBeGreaterThanOrEqual(lastGroupEnd);
    expect(category!.rounds[1]!.from.getTime()).toBeGreaterThanOrEqual(
      category!.rounds[0]!.until.getTime(),
    );
    // Dutch wording.
    expect((await expectedKnockout(t.id, 'nl'))[0]!.rounds[0]!.matches[0]!.a).toBe('1e');
    // Nothing was stored.
    expect(await prisma.match.count({ where: { draw: { stage: 'KNOCKOUT' } } })).toBe(0);
  });

  it('stops when the real knockout exists, or a group match has no time yet', async () => {
    const { actor, t, event } = await hybrid();
    const slot = await prisma.courtSlot.findFirstOrThrow({ where: { tournamentId: t.id } });
    await prisma.courtSlot.delete({ where: { id: slot.id } });
    expect(await expectedKnockout(t.id, 'en')).toEqual([]);
    await proposeTournamentSchedule(actor, t.id, { mode: 'remaining' }, meta);
    expect(await expectedKnockout(t.id, 'en')).toHaveLength(1);
    await playAll(actor, event.id);
    await createKnockoutFromGroups(actor, event.id, meta);
    expect(await expectedKnockout(t.id, 'en')).toEqual([]);
  });

  it('can be switched off per tournament, by those who manage it', async () => {
    const { actor, t } = await hybrid();
    const nosy = await createPlayer();
    const outsider = (await actorFromWebToken(
      (await createWebSession(nosy.userId, meta, true)).token,
    ))!;
    await expect(setExpectedKnockout(outsider, t.id, false, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    await setExpectedKnockout(actor, t.id, false, meta);
    expect(await expectedKnockout(t.id, 'en')).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'schedule.expectedKnockout' } })).toBe(1);
    await setExpectedKnockout(actor, t.id, true, meta);
    expect(await expectedKnockout(t.id, 'en')).toHaveLength(1);
  });

  it('shows players only their own categories, and only once the schedule is published', async () => {
    const { actor, t, event, players } = await hybrid();
    expect(await publicExpectedKnockout('utrecht-open', 'en')).toEqual([]);
    expect(await expectedKnockoutOfPlayers([players[0]!.profile.id], 'en')).toEqual([]);
    await publishSchedule(actor, t.id, true, meta);
    expect(await publicExpectedKnockout('utrecht-open', 'en')).toHaveLength(1);
    const mine = await expectedKnockoutOfPlayers([players[0]!.profile.id], 'en');
    expect(mine).toMatchObject([
      { tournament: { slug: 'utrecht-open' }, categories: [{ eventId: event.id }] },
    ]);
    // Someone who plays elsewhere sees nothing.
    const other = await createPlayer();
    const profile = await prisma.playerProfile.findUniqueOrThrow({
      where: { userId: other.userId },
    });
    expect(await expectedKnockoutOfPlayers([profile.id], 'en')).toEqual([]);
  });

  it('pairs the real knockout by ranking: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6 (D123)', async () => {
    const actor = await admin();
    const { t, event } = await setup('HYBRID_ROUND_ROBIN_KNOCKOUT', 8, { knockoutSize: 8 });
    await generateDraw(actor, event.id, meta, seededRng(5));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    // Eight qualifiers: the expected rows already say who meets whom.
    const [category] = await expectedKnockout(t.id, 'en');
    expect(category!.rounds.map((r) => r.name)).toEqual(['Quarter-final', 'Semi-final', 'Final']);
    expect(category!.rounds[0]!.matches).toEqual([
      { a: '1st', b: '8th' },
      { a: '4th', b: '5th' },
      { a: '2nd', b: '7th' },
      { a: '3rd', b: '6th' },
    ]);
    await playAll(actor, event.id);
    await createKnockoutFromGroups(actor, event.id, meta);
    // The real quarter-finals are those pairs: the seeds are the ranks.
    const first = await prisma.match.findMany({
      where: { draw: { eventId: event.id, stage: 'KNOCKOUT' }, round: 1 },
      orderBy: { matchNumber: 'asc' },
      include: { entryA: true, entryB: true },
    });
    expect(first.map((m) => [m.entryA!.seed, m.entryB!.seed])).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });
});

describe('start needs a court and time (D126)', () => {
  it('refuses a match with no court, and starts it once it is placed', async () => {
    const actor = await admin();
    const { t, event } = await setup('ROUND_ROBIN', 4);
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    const match = await prisma.match.findFirstOrThrow({
      where: { draw: { eventId: event.id } },
    });
    await unscheduleMatch(actor, match.id, meta);
    await expect(startMatch(actor, match.id, meta)).rejects.toMatchObject({
      code: 'matchNotScheduled',
    });
    const court = await prisma.court.findFirstOrThrow({
      where: { venue: { tournaments: { some: { id: t.id } } }, number: 2 },
    });
    await moveMatch(actor, match.id, { courtId: court.id, startsAt: '2027-03-13T16:00' }, meta);
    await startMatch(actor, match.id, meta);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      status: 'IN_PROGRESS',
    });
  });
});

describe('semi-finals paired by seed (D127)', () => {
  const lose = {
    games: [
      [10, 21],
      [12, 21],
    ],
  };
  async function quarterFinals(off = false) {
    const actor = await admin();
    const { t, event } = await setup('HYBRID_ROUND_ROBIN_KNOCKOUT', 8, { knockoutSize: 8 });
    await generateDraw(actor, event.id, meta, seededRng(5));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    if (off) await setSemiPairing(actor, t.id, event.id, false, meta);
    await playAll(actor, event.id);
    await createKnockoutFromGroups(actor, event.id, meta);
    const ko = { draw: { eventId: event.id, stage: 'KNOCKOUT' } };
    const qf = await prisma.match.findMany({
      where: { ...ko, round: 1 },
      orderBy: { matchNumber: 'asc' },
    });
    const semis = () =>
      prisma.match.findMany({
        where: { ...ko, round: 2 },
        orderBy: { matchNumber: 'asc' },
        include: { entryA: true, entryB: true },
      });
    const seeds = async () =>
      (await semis()).map((m) => [m.entryA?.seed ?? null, m.entryB?.seed ?? null]);
    return { actor, t, event, qf, seeds, semis };
  }

  it('waits for the last quarter-final, then pairs best v worst and 2nd v 3rd', async () => {
    const { actor, qf, seeds } = await quarterFinals();
    // Seed 8 beats seed 1; 4, 2 and 3 win: the four left are 8, 4, 2, 3.
    await recordResult(actor, qf[0]!.id, lose, meta);
    await recordResult(actor, qf[1]!.id, win, meta);
    await recordResult(actor, qf[2]!.id, win, meta);
    expect(await seeds()).toEqual([
      [null, null],
      [null, null],
    ]);
    await recordResult(actor, qf[3]!.id, win, meta);
    // A fixed bracket would give 8 v 4 and 2 v 3.
    expect(await seeds()).toEqual([
      [2, 8],
      [3, 4],
    ]);
  });

  it('re-pairs on a correction until a semi-final has started', async () => {
    const { actor, qf, seeds, semis } = await quarterFinals();
    for (const m of qf) await recordResult(actor, m.id, win, meta); // 1, 4, 2, 3
    expect(await seeds()).toEqual([
      [1, 4],
      [2, 3],
    ]);
    await recordResult(actor, qf[0]!.id, lose, meta); // 8 instead of 1
    expect(await seeds()).toEqual([
      [2, 8],
      [3, 4],
    ]);
    // The winners now point at their new semi-final.
    const moved = await prisma.match.findUniqueOrThrow({ where: { id: qf[0]!.id } });
    expect(moved.nextMatchId).toBe((await semis())[0]!.id);
    const [semi] = await semis();
    await prisma.match.update({ where: { id: semi!.id }, data: { status: 'IN_PROGRESS' } });
    await expect(recordResult(actor, qf[0]!.id, win, meta)).rejects.toMatchObject({
      code: 'nextMatchPlayed',
    });
  });

  it('keeps the fixed bracket when the category switches it off', async () => {
    const { actor, qf, seeds } = await quarterFinals(true);
    await recordResult(actor, qf[0]!.id, lose, meta);
    expect((await seeds())[0]).toEqual([8, null]);
    for (const m of qf.slice(1)) await recordResult(actor, m.id, win, meta);
    expect(await seeds()).toEqual([
      [8, 4],
      [2, 3],
    ]);
  });

  it('swaps a team between the semi-finals by hand, and keeps it after a correction (D130)', async () => {
    const { actor: admin1, qf, seeds, semis } = await quarterFinals();
    const actor = await owner();
    await expect(
      swapSemiTeams(
        admin1,
        (await semis())[0]!.id,
        { side: 'B', otherMatchId: (await semis())[1]!.id, otherSide: 'A' },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    for (const m of qf) await recordResult(actor, m.id, win, meta); // 1 v 4, 2 v 3
    const [s1, s2] = await semis();
    // Swap seed 4 (semi 1, side B) with seed 2 (semi 2, side A).
    await swapSemiTeams(actor, s1!.id, { side: 'B', otherMatchId: s2!.id, otherSide: 'A' }, meta);
    expect(await seeds()).toEqual([
      [1, 2],
      [4, 3],
    ]);
    // The quarter-final winners follow their team: correcting one keeps the arrangement.
    const two = qf.find((m) => m.matchNumber === 3)!;
    const moved = await prisma.match.findUniqueOrThrow({ where: { id: two.id } });
    expect(moved.nextMatchId).toBe(s1!.id);
    expect(await prisma.auditLog.count({ where: { action: 'match.swapTeams' } })).toBe(1);
    // Not once a semi-final has started, and not across rounds.
    await expect(
      swapSemiTeams(actor, s1!.id, { side: 'A', otherMatchId: qf[0]!.id, otherSide: 'A' }, meta),
    ).rejects.toMatchObject({ code: 'validation' });
    await prisma.match.update({ where: { id: s2!.id }, data: { status: 'IN_PROGRESS' } });
    await expect(
      swapSemiTeams(actor, s1!.id, { side: 'A', otherMatchId: s2!.id, otherSide: 'A' }, meta),
    ).rejects.toMatchObject({ code: 'nextMatchPlayed' });
  });

  it('offers the swap on both semi-finals of the desk, until one has started (D130)', async () => {
    const { actor, t, qf } = await quarterFinals();
    for (const m of qf) await recordResult(actor, m.id, win, meta);
    // Only owners get the swap.
    expect((await openDesk(actor, t.id)).items.filter((i) => i.swap)).toHaveLength(0);
    const { items } = await openDesk(await owner(), t.id);
    const semi = items.filter((i) => i.swap);
    expect(semi).toHaveLength(2);
    expect(semi[0]!.swap!.otherId).toBe(semi[1]!.id);
    expect(semi[0]!.swap!.mine.map((o) => o.side)).toEqual(['A', 'B']);
  });

  it('lets a played semi-final be corrected while the final has not started (D131)', async () => {
    const { actor, qf, semis } = await quarterFinals();
    for (const m of qf) await recordResult(actor, m.id, win, meta);
    const [s1] = await semis();
    await recordResult(actor, s1!.id, win, meta);
    await recordResult(actor, s1!.id, lose, meta);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: s1!.id } })).toMatchObject({
      winnerEntryId: s1!.entryBId,
    });
  });
});
