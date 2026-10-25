import { prisma, Role } from '@tourneasy/db';
import { seededRng } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { generateDraw, publishDraws } from './draw-service';
import { paymentsOverview } from './payment-service';
import { needsAttention, setupChecklist } from './progress-service';
import { proposeTournamentSchedule, publishSchedule } from './schedule-service';
import { actorFromWebToken, createWebSession } from './session-service';
import { listTournaments } from './tournament-service';

beforeEach(resetDatabase);

async function actorWith(role: Role) {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

async function tournament(name: string, extra: Record<string, unknown> = {}) {
  return prisma.tournament.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/\s/g, '-'),
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2026-02-01'),
      entryDeadline: new Date('2026-02-01'),
      withdrawalDeadline: new Date('2026-02-01'),
      ...extra,
    },
  });
}

async function enter(eventId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const p = await createPlayer();
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: p.userId } });
    await prisma.registration.create({
      data: {
        eventId,
        status: i < n - 1 ? 'CONFIRMED' : 'WAITLISTED',
        participants: {
          create: {
            eventId,
            playerId: profile.id,
            role: 'PRIMARY',
            checkInToken: `c${eventId}${i}`,
          },
        },
      },
    });
  }
}

describe('tournament progress (D75)', () => {
  it('walks the set-up checklist and lists what needs attention', async () => {
    const admin = await actorWith(Role.ADMIN);
    const venue = await prisma.venue.create({
      data: {
        name: 'Hal',
        slug: 'hal',
        street: 'Weg',
        houseNumber: '1',
        postcode: '3511 AB',
        city: 'Utrecht',
        province: 'UTRECHT',
        numberOfCourts: 2,
      },
    });
    const t = await tournament('Utrecht Open');
    let setup = await setupChecklist(admin, t.id);
    expect(setup.next).toBe('venue');
    expect(setup.steps.filter((s) => s.done)).toHaveLength(0);

    await prisma.tournament.update({
      where: { id: t.id },
      data: { venueId: venue.id, status: 'OPEN', dayStartTime: '09:00', dayEndTime: '18:00' },
    });
    const event = await prisma.tournamentEvent.create({
      data: { tournamentId: t.id, discipline: 'DE', feeCents: 1000, drawType: 'ROUND_ROBIN' },
    });
    await enter(event.id, 5); // 4 confirmed + 1 waiting
    setup = await setupChecklist(admin, t.id);
    expect(setup.next).toBe('published');

    // Open but not published, unpaid entries and a waiting list need attention.
    const keys = (await needsAttention(admin, new Date('2026-01-15'))).map((a) => [a.key, a.count]);
    expect(keys).toEqual([
      ['notPublished', 1],
      ['unpaid', 4],
      ['waitlist', 1],
    ]);

    await prisma.tournament.update({ where: { id: t.id }, data: { isPublished: true } });
    // After entries close, a category without a published draw needs one.
    expect((await needsAttention(admin, new Date('2027-03-05'))).map((a) => a.key)).toContain(
      'drawsMissing',
    );
    await prisma.tournament.update({ where: { id: t.id }, data: { status: 'CLOSED' } });
    await generateDraw(admin, event.id, meta, seededRng(1));
    await publishDraws(admin, event.id, true, meta);
    await proposeTournamentSchedule(admin, t.id, {}, meta);
    expect((await needsAttention(admin, new Date('2027-03-05'))).map((a) => a.key)).toContain(
      'scheduleNotPublished',
    );
    await publishSchedule(admin, t.id, true, meta);
    setup = await setupChecklist(admin, t.id);
    expect(setup.next).toBeNull();
  });

  it("gives organisers their own tournament's payments and the list its counts", async () => {
    const organiser = await actorWith(Role.ORGANISER);
    const mine = await tournament('Mine');
    const other = await tournament('Other');
    await prisma.tournamentOrganiser.create({
      data: { tournamentId: mine.id, userId: organiser.userId },
    });
    const event = await prisma.tournamentEvent.create({
      data: { tournamentId: mine.id, discipline: 'DE', feeCents: 1500 },
    });
    await enter(event.id, 3);

    const overview = await paymentsOverview(organiser, { tournamentId: mine.id });
    expect(overview.totals).toMatchObject({ outstandingShares: 2, outstandingCents: 3000 });
    await expect(paymentsOverview(organiser, { tournamentId: other.id })).rejects.toMatchObject({
      code: 'notFound',
    });
    await expect(paymentsOverview(organiser, {})).rejects.toMatchObject({ code: 'forbidden' });

    const list = await listTournaments(organiser);
    expect(list.tournaments.map((x) => [x.name, x.entries, x.waitlisted])).toEqual([
      ['Mine', 2, 1],
    ]);
  });
});
