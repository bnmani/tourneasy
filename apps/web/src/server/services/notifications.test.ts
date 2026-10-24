import { prisma, Role } from '@tourneasy/db';
import { seededRng } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '@/server/email/mailer';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { generateDraw, publishDraws } from './draw-service';
import { deadlineReminders, resultsSummaries, tournamentReminders } from './jobs-service';
import { GET as logoGet } from '@/app/api/v1/tournament-logos/[id]/route';
import { imageInfo, removeTournamentLogo, setTournamentLogo, tournamentLogo } from './logo-service';
import { createNews } from './news-service';
import {
  deliverQueued,
  getMyPreferences,
  saveMyPreferences,
  unsubscribe,
  unsubscribeUrl,
} from './notification-service';
import { recordResult } from './results-service';
import {
  moveMatch,
  proposeTournamentSchedule,
  publishSchedule,
  getSchedule,
} from './schedule-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function actorFor(userId: string) {
  return (await actorFromWebToken((await createWebSession(userId, meta, true)).token))!;
}

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  return actorFor(p.userId);
}

/** A tournament with 4 entered players (with accounts) in a round robin. */
async function setup(dates: {
  startsOn: Date;
  endsOn: Date;
  closes?: Date;
  status?: 'OPEN' | 'CLOSED';
}) {
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
  const t = await prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: dates.startsOn,
      endsOn: dates.endsOn,
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: dates.closes ?? new Date('2026-02-01'),
      entryDeadline: dates.closes ?? new Date('2026-02-01'),
      withdrawalDeadline: dates.closes ?? new Date('2026-02-01'),
      isPublished: true,
      status: dates.status ?? 'CLOSED',
      venueId: venue.id,
      dayStartTime: '09:00',
      dayEndTime: '18:00',
    },
  });
  const event = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'DE', feeCents: 0, drawType: 'ROUND_ROBIN' },
  });
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = await createPlayer({ firstName: `Speler`, email: `p${i}@example.test` });
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
            paymentStatus: 'WAIVED',
          },
        },
      },
    });
    players.push({ ...p, profile });
  }
  outbox.length = 0; // forget the sign-up emails of the test players
  return { t, event, players };
}

const sentTo = (email: string) => outbox.filter((m) => m.to === email);

describe('notifications (D62)', () => {
  it('emails each player their matches when the schedule is published, once, and again when one moves', async () => {
    const actor = await admin();
    const { t, event, players } = await setup({
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
    });
    await generateDraw(actor, event.id, meta, seededRng(1));
    await publishDraws(actor, event.id, true, meta);
    await proposeTournamentSchedule(actor, t.id, {}, meta);
    await publishSchedule(actor, t.id, true, meta);
    await deliverQueued();
    const first = sentTo('p0@example.test');
    expect(first).toHaveLength(1);
    expect(first[0]!.subject).toBe('Je wedstrijden voor Utrecht Open');
    expect(first[0]!.text.match(/tegen /g)).toHaveLength(3);
    expect(first[0]!.headers).toBeUndefined(); // essential: no unsubscribe

    await deliverQueued(); // nothing new
    expect(sentTo('p0@example.test')).toHaveLength(1);

    const schedule = await getSchedule(actor, t.id);
    const m = schedule.scheduled.find((i) => i.players.includes(players[0]!.profile.id))!;
    await moveMatch(actor, m.id, { courtId: m.court!.id, startsAt: '2027-03-13T17:00' }, meta);
    await deliverQueued();
    const changed = sentTo('p0@example.test').at(-1)!;
    expect(changed.subject).toBe('Gewijzigd: je wedstrijden voor Utrecht Open');
    // Only the two players of that match get the change.
    expect(outbox.filter((x) => x.subject.startsWith('Gewijzigd'))).toHaveLength(2);
  });

  it('sends a reminder two days before, once, with an unsubscribe link that works', async () => {
    const { players } = await setup({
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
    });
    const now = new Date('2027-03-11T12:00:00Z');
    expect(await tournamentReminders(new Date('2027-03-09T12:00:00Z'))).toBe(0);
    expect(await tournamentReminders(now)).toBe(4);
    expect(await tournamentReminders(now)).toBe(0); // duplicates are skipped
    await deliverQueued();
    const mail = sentTo('p1@example.test')[0]!;
    expect(mail.subject).toBe('Binnenkort: Utrecht Open');
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    const url = new URL(unsubscribeUrl('nl', players[1]!.userId, 'TOURNAMENT_REMINDER'));
    expect(await unsubscribe(url.searchParams.get('u')!, 'TOURNAMENT_REMINDER', 'forged')).toBe(
      false,
    );
    expect(
      await unsubscribe(
        url.searchParams.get('u')!,
        'TOURNAMENT_REMINDER',
        url.searchParams.get('s')!,
      ),
    ).toBe(true);
    const me = await actorFor(players[1]!.userId);
    expect(
      (await getMyPreferences(me)).find((p) => p.type === 'TOURNAMENT_REMINDER')?.enabled,
    ).toBe(false);
  });

  it('respects preferences: switched-off news is not sent', async () => {
    const actor = await admin();
    const { t, players } = await setup({
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
    });
    await saveMyPreferences(await actorFor(players[2]!.userId), { ANNOUNCEMENT: false });
    await createNews(
      actor,
      t.id,
      { titleNl: 'Parkeren', bodyNl: 'Parkeer bij de achteringang.', publish: true, email: true },
      meta,
    );
    await deliverQueued();
    expect(sentTo('p0@example.test').map((m) => m.subject)).toEqual(['Parkeren – Utrecht Open']);
    expect(sentTo('p2@example.test')).toHaveLength(0);
  });

  it('reminds players of open items before the entry deadline', async () => {
    const { t } = await setup({
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      closes: new Date('2027-02-27T22:59:00Z'),
      status: 'OPEN',
    });
    const gd = await prisma.tournamentEvent.create({
      data: { tournamentId: t.id, discipline: 'GD', feeCents: 0 },
    });
    const loner = await createPlayer({ email: 'loner@example.test', gender: 'MALE' });
    const profile = await prisma.playerProfile.findUniqueOrThrow({
      where: { userId: loner.userId },
    });
    await prisma.partnerRequest.create({ data: { eventId: gd.id, playerId: profile.id } });
    outbox.length = 0;
    expect(await deadlineReminders(new Date('2027-02-26T12:00:00Z'))).toBe(1);
    await deliverQueued();
    expect(sentTo('loner@example.test')[0]!.text).toContain('je zoekt nog een partner');
  });

  it('sends each player their results after the tournament', async () => {
    const actor = await admin();
    const { t, event } = await setup({
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
    });
    await generateDraw(actor, event.id, meta, seededRng(2));
    await publishDraws(actor, event.id, true, meta);
    for (const m of await prisma.match.findMany({ where: { draw: { eventId: event.id } } }))
      await recordResult(
        actor,
        m.id,
        {
          games: [
            [21, 10],
            [21, 12],
          ],
        },
        meta,
      );
    expect(await resultsSummaries(new Date('2027-03-13T20:00:00Z'))).toBe(0); // not the day itself
    expect(await resultsSummaries(new Date('2027-03-14T09:00:00Z'))).toBe(4);
    await deliverQueued();
    const mail = sentTo('p0@example.test').find((m) => m.subject.startsWith('Je uitslagen'))!;
    expect(mail.text.match(/(gewonnen|verloren) tegen/g)).toHaveLength(3);
    expect(t.id).toBeTruthy();
  });
});

/** A PNG header of the given size (enough for the type and size checks). */
function png(width: number, height: number, extra = 0) {
  const bytes = new Uint8Array(33 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe('tournament logo (D67)', () => {
  it('reads PNG and JPEG headers and refuses anything else', () => {
    expect(imageInfo(png(400, 100))).toEqual({ mimeType: 'image/png', width: 400, height: 100 });
    // JPEG: start of image, an APP0 segment, then the frame header with height and width.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 120, 1, 44, 3, 0, 0,
    ]);
    expect(imageInfo(jpeg)).toEqual({ mimeType: 'image/jpeg', width: 300, height: 120 });
    expect(imageInfo(new TextEncoder().encode('<svg onload="x()"></svg>'))).toBeNull();
  });

  it('is set by the tournament managers, served publicly and shown in its emails', async () => {
    const actor = await admin();
    const { t, players } = await setup({
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
    });
    const player = await actorFor(players[0]!.userId);
    await expect(
      setTournamentLogo(player, t.id, { bytes: png(400, 100) }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    await expect(
      setTournamentLogo(actor, t.id, { bytes: png(400, 100, 1024 * 1024) }, meta),
    ).rejects.toMatchObject({ code: 'logoTooLarge' });
    await expect(
      setTournamentLogo(actor, t.id, { bytes: new TextEncoder().encode('GIF89a…') }, meta),
    ).rejects.toMatchObject({ code: 'logoInvalid' });

    await setTournamentLogo(actor, t.id, { bytes: png(400, 100) }, meta);
    const logo = (await tournamentLogo(t.id))!;
    expect(logo).toMatchObject({ width: 400, height: 100 });
    const response = await logoGet(new Request(logo.url), {
      params: Promise.resolve({ id: t.id }),
    });
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('immutable');

    await createNews(
      actor,
      t.id,
      { titleNl: 'Parkeren', bodyNl: 'Parkeer achter.', publish: true, email: true },
      meta,
    );
    await deliverQueued();
    const html = sentTo('p0@example.test').at(-1)!.html;
    // 56 px high keeps 4:1 → 224 px wide.
    expect(html).toContain(
      `<img src="${logo.url.replace(/&/g, '&amp;')}" alt="Utrecht Open" width="224" height="56"`,
    );

    expect(html).not.toContain('tourneasy-mark.png');

    await removeTournamentLogo(actor, t.id, meta);
    expect(await tournamentLogo(t.id)).toBeNull();
    expect(
      (await logoGet(new Request(logo.url), { params: Promise.resolve({ id: t.id }) })).status,
    ).toBe(404);
  });
});
