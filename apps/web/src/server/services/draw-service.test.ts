import { prisma, Role, type DrawType } from '@tourneasy/db';
import { seededRng } from '@tourneasy/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import {
  applySuggestedSeeds,
  generateDraw,
  getDrawSetup,
  publicDraws,
  publishDraws,
  setSeeds,
  swapEntries,
} from './draw-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

/** A closed tournament with one event and `n` confirmed singles entries, levels 1…n. */
async function setup(drawType: DrawType, n: number, extra: Record<string, unknown> = {}) {
  const levels = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      prisma.levelClass.upsert({
        where: { code: `L${i + 1}` },
        create: { code: `L${i + 1}`, name: { nl: `L${i + 1}` }, rank: i + 1 },
        update: {},
      }),
    ),
  );
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
    },
  });
  const event = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'DE', feeCents: 0, drawType, ...extra },
  });
  const regs: string[] = [];
  // Entered in reverse level order, so the suggestion must really sort by level.
  for (let i = n - 1; i >= 0; i--) {
    const p = await createPlayer();
    const profile = await prisma.playerProfile.update({
      where: { userId: p.userId },
      data: { levelSinglesId: levels[i]!.id },
    });
    const r = await prisma.registration.create({
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
    regs[i] = r.id;
  }
  return { t, event, regs };
}

describe('draws', () => {
  it('suggests seeds by level and builds a knockout with byes for the top seeds', async () => {
    const actor = await admin();
    const { event, regs } = await setup('KNOCKOUT', 6);
    const before = await getDrawSetup(actor, event.id);
    expect(before.defaultSeeds).toBe(2);
    expect(before.entries.find((e) => e.id === regs[0])?.suggestedRank).toBe(1);

    await applySuggestedSeeds(actor, event.id, 2, meta);
    const seeds = await prisma.registration.findMany({
      where: { seed: { not: null } },
      orderBy: { seed: 'asc' },
    });
    expect(seeds.map((s) => s.id)).toEqual([regs[0], regs[1]]);

    await generateDraw(actor, event.id, meta, seededRng(1));
    const setupAfter = await getDrawSetup(actor, event.id);
    expect(setupAfter.status).toBe('DRAFT');
    const draw = setupAfter.draws[0]!;
    expect(draw.size).toBe(8);
    expect(draw.matches).toHaveLength(7);
    // Two byes: seeds 1 and 2 are already through to round 2.
    const byes = draw.matches.filter((m) => m.status === 'BYE');
    expect(byes).toHaveLength(2);
    const winners = byes.map(
      (m) => draw.entries.find((e) => e.id === m.winnerEntryId)?.registrationId,
    );
    expect(winners.sort()).toEqual([regs[0], regs[1]].sort());
    const round2 = draw.matches.filter((m) => m.round === 2);
    expect(round2.filter((m) => m.entryAId || m.entryBId)).toHaveLength(2);
  });

  it('refuses gaps in the seeds and changes after publishing', async () => {
    const actor = await admin();
    const { event, regs } = await setup('KNOCKOUT', 4);
    await expect(
      setSeeds(actor, event.id, { seeds: [{ registrationId: regs[0]!, seed: 2 }] }, meta),
    ).rejects.toMatchObject({ details: { fields: { seeds: 'seedOrder' } } });
    await generateDraw(actor, event.id, meta, seededRng(2));
    await publishDraws(actor, event.id, true, meta);
    await expect(generateDraw(actor, event.id, meta)).rejects.toMatchObject({
      code: 'drawPublished',
    });
    expect((await publicDraws('utrecht-open'))[0]!.draws).toHaveLength(1);
  });

  it('runs double knockout byes through the losers bracket', async () => {
    const actor = await admin();
    const { event } = await setup('DOUBLE_KNOCKOUT', 5);
    await generateDraw(actor, event.id, meta, seededRng(3));
    const draw = (await getDrawSetup(actor, event.id)).draws[0]!;
    expect(draw.matches.filter((m) => m.bracket === 'L')).toHaveLength(6);
    // 3 byes in round 1; in the losers bracket a bye meets a bye or a player and resolves.
    expect(draw.matches.filter((m) => m.bracket === 'W' && m.status === 'BYE')).toHaveLength(3);
    expect(
      draw.matches.filter((m) => m.bracket === 'L' && m.status === 'BYE').length,
    ).toBeGreaterThan(0);
  });

  it('spreads seeds over groups and lets the organiser move entries between groups', async () => {
    const actor = await admin();
    const { event, regs } = await setup('GROUPS_KNOCKOUT', 8, { groupSize: 4, advancePerGroup: 2 });
    expect((await getDrawSetup(actor, event.id)).defaultSeeds).toBe(2);
    await applySuggestedSeeds(actor, event.id, 2, meta);
    await generateDraw(actor, event.id, meta, seededRng(4));
    let draws = (await getDrawSetup(actor, event.id)).draws;
    expect(draws.map((d) => d.name)).toEqual(['A', 'B']);
    expect(draws.map((d) => d.matches.length)).toEqual([6, 6]);
    expect(draws[0]!.entries.some((e) => e.registrationId === regs[0])).toBe(true);
    expect(draws[1]!.entries.some((e) => e.registrationId === regs[1])).toBe(true);

    const a = draws[0]!.entries.find((e) => e.registrationId === regs[0])!;
    const b = draws[1]!.entries[3]!;
    await swapEntries(actor, event.id, { a: a.id, b: b.id }, meta);
    draws = (await getDrawSetup(actor, event.id)).draws;
    expect(draws[1]!.entries.some((e) => e.registrationId === regs[0])).toBe(true);
    expect(draws.map((d) => d.matches.length)).toEqual([6, 6]);
  });

  it('pairs hybrid entries with the set number of opponents and Swiss by seed', async () => {
    const actor = await admin();
    const { event } = await setup('HYBRID_ROUND_ROBIN_KNOCKOUT', 8, {
      matchesPerEntry: 3,
      knockoutSize: 4,
    });
    await generateDraw(actor, event.id, meta, seededRng(5));
    const hybrid = (await getDrawSetup(actor, event.id)).draws[0]!;
    expect(hybrid.matches).toHaveLength(12); // 8 × 3 / 2

    await prisma.tournamentEvent.update({ where: { id: event.id }, data: { drawType: 'SWISS' } });
    await generateDraw(actor, event.id, meta, seededRng(6));
    const swiss = (await getDrawSetup(actor, event.id)).draws[0]!;
    expect(swiss.matches).toHaveLength(4);
  });

  it('needs enough entries and closed entries before publishing', async () => {
    const actor = await admin();
    const { event, t } = await setup('DOUBLE_KNOCKOUT', 3);
    await expect(generateDraw(actor, event.id, meta)).rejects.toMatchObject({
      code: 'tooFewEntries',
    });
    await prisma.tournamentEvent.update({
      where: { id: event.id },
      data: { drawType: 'KNOCKOUT' },
    });
    await prisma.tournament.update({
      where: { id: t.id },
      data: { registrationClosesAt: new Date('2099-01-01') },
    });
    await generateDraw(actor, event.id, meta);
    await expect(publishDraws(actor, event.id, true, meta)).rejects.toMatchObject({
      code: 'entriesStillOpen',
    });
  });
});
