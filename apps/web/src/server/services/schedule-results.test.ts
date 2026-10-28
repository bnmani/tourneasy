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
} from './schedule-service';
import { PDFDocument } from 'pdf-lib';
import { buildSchedulePdf, pdfSafe } from '../pdf/schedule-pdf';
import { checkInList, checkInPdf, payAtDesk, setPlayerCheckIn } from './checkin-service';
import { courtsPdf, schedulePdf, scheduleXlsx } from './schedule-pdf-service';
import { readXlsx } from '../lib/xlsx';
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
    // Match numbers are unique across both groups and the knockout (no two "#1"s at the desk).
    const desk = await deskMatches(
      actor,
      (await prisma.tournamentEvent.findUniqueOrThrow({ where: { id: event.id } })).tournamentId,
      'open',
      'en',
    );
    const numbers = desk.items.map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(desk.items.find((i) => i.a === null || i.a.startsWith('Winner #'))).toBeTruthy();
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

    // Per court: managers only, even once published.
    await expect(courtsPdf(null, t.slug, 'nl')).rejects.toMatchObject({ code: 'notFound' });
    const courts = await courtsPdf(actor, t.slug, 'en');
    expect(courts.filename).toBe('courts-utrecht-open.pdf');
    expect((await PDFDocument.load(courts.bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
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
    const desk = await deskMatches(actor, t.id, 'open');
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
