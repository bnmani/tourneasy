import { prisma, Role } from '@tourneasy/db';
import { toCsv } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { toXlsx } from '../lib/xlsx';
import { importTournamentEntries } from './entry-import-service';
import { exportTournamentEntries } from './registration-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function player(overrides: Record<string, unknown> = {}, role?: Role) {
  const p = await createPlayer(overrides);
  if (role) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const actor = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
  const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: p.userId } });
  return { ...p, actor, profile };
}

async function setup() {
  const t = await prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
      registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
      entryDeadline: new Date('2027-02-27T22:59:00Z'),
      withdrawalDeadline: new Date('2027-02-20T22:59:00Z'),
      maxEventsPerPlayer: 1,
    },
  });
  const de = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'DE', feeCents: 1500, maxEntries: 2 },
  });
  const gd = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'GD', feeCents: 0 },
  });
  return { t, de, gd };
}

const csv = (rows: string[][]) =>
  new TextEncoder().encode(
    toCsv(['event', 'memberNumber', 'email', 'partnerMemberNumber', 'partnerEmail'], rows),
  );

describe('importing participants', () => {
  it('is for admins only', async () => {
    const { t } = await setup();
    const anna = await player();
    await expect(importTournamentEntries(anna.actor, t.id, csv([]), meta)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('enters players and pairs, waitlists when full and reports bad rows', async () => {
    const { t, de, gd } = await setup();
    const admin = await player({}, Role.ADMIN);
    const [a, b, c] = [await player(), await player(), await player()];
    const bram = await player({ gender: 'MALE' });
    const result = await importTournamentEntries(
      admin.actor,
      t.id,
      csv([
        ['Damesenkel', a.profile.memberNumber, '', '', ''],
        ['damesenkel', '', b.email, '', ''],
        ["Women's singles", c.profile.memberNumber, '', '', ''],
        ['Gemengd dubbel', a.profile.memberNumber, '', '', bram.email],
        ['Damesenkel', a.profile.memberNumber, '', '', ''],
        ['Herenenkel', a.profile.memberNumber, '', '', ''],
        ['Damesenkel', 'TE999999', '', '', ''],
        ['Damesenkel', bram.profile.memberNumber, '', '', ''],
      ]),
      meta,
    );
    expect(result).toMatchObject({ created: 3, waitlisted: 1, skipped: 4 });
    expect(result.errors.map((e) => [e.line, e.error])).toEqual([
      [7, 'eventNotFound'],
      [6, 'alreadyEntered'],
      [8, 'playerNotFound'],
      [9, 'notEligible'],
    ]);
    const pair = await prisma.registration.findFirstOrThrow({
      where: { eventId: gd.id },
      include: { participants: true },
    });
    expect(pair.participants.map((p) => p.paymentStatus)).toEqual(['WAIVED', 'WAIVED']);
    expect(
      await prisma.registration.count({ where: { eventId: de.id, status: 'WAITLISTED' } }),
    ).toBe(1);
  });

  it('takes the participants export back (Excel), skipping what is already there', async () => {
    const { t } = await setup();
    const admin = await player({}, Role.ADMIN);
    const anna = await player();
    const bram = await player({ gender: 'MALE' });
    await importTournamentEntries(
      admin.actor,
      t.id,
      csv([['Gemengd dubbel', anna.profile.memberNumber, '', bram.profile.memberNumber, '']]),
      meta,
    );
    const exported = await exportTournamentEntries(admin.actor, t.id, {}, 'nl');
    // Into a second tournament with the same events: the pair comes across as one entry.
    const second = await prisma.tournament.create({
      data: {
        ...(await prisma.tournament.findUniqueOrThrow({
          where: { id: t.id },
          select: {
            name: true,
            startsOn: true,
            endsOn: true,
            registrationOpensAt: true,
            registrationClosesAt: true,
            entryDeadline: true,
            withdrawalDeadline: true,
          },
        })),
        slug: 'second',
      },
    });
    await prisma.tournamentEvent.create({
      data: { tournamentId: second.id, discipline: 'GD', feeCents: 1000 },
    });
    const result = await importTournamentEntries(
      admin.actor,
      second.id,
      toXlsx('Deelnemers', exported.header, exported.rows),
      meta,
    );
    expect(result).toMatchObject({ created: 1, skipped: 0 });
    const pair = await prisma.registration.findFirstOrThrow({
      where: { event: { tournamentId: second.id } },
      include: { participants: { orderBy: { role: 'asc' } } },
    });
    expect(pair.participants.map((p) => [p.role, p.paymentStatus])).toEqual([
      ['PRIMARY', 'UNPAID'],
      ['PARTNER', 'UNPAID'],
    ]);
    // Importing the same file again changes nothing.
    const again = await importTournamentEntries(
      admin.actor,
      second.id,
      toXlsx('Deelnemers', exported.header, exported.rows),
      meta,
    );
    expect(again).toMatchObject({ created: 0, skipped: 1 });
  });
});
