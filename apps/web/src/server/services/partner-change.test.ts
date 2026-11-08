import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import { addEntryAsOrganiser } from './entry-import-service';
import { changePartner } from './partner-change-service';
import { markShareAsPaid } from './payment-service';
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
      name: 'Almere Open',
      slug: 'almere-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
      registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
      entryDeadline: new Date('2027-02-27T22:59:00Z'),
      withdrawalDeadline: new Date('2027-02-20T22:59:00Z'),
      maxEventsPerPlayer: 3,
    },
  });
  const gd = await prisma.tournamentEvent.create({
    data: { tournamentId: t.id, discipline: 'GD', feeCents: 1250 },
  });
  const admin = await player({}, Role.ADMIN);
  return { t, gd, admin: admin.actor };
}

/** Enters a mixed pair as the organiser; returns the registration and its two shares. */
async function pair(
  admin: Awaited<ReturnType<typeof setup>>['admin'],
  tournamentId: string,
  eventId: string,
  man: string,
  woman: string,
) {
  await addEntryAsOrganiser(
    admin,
    tournamentId,
    { eventId, player: { memberNumber: man }, partner: { memberNumber: woman } },
    meta,
  );
  const r = await prisma.registration.findFirstOrThrow({
    where: { eventId, participants: { some: { player: { memberNumber: man } } } },
    include: { participants: { include: { player: true } } },
  });
  const share = (n: string) => r.participants.find((p) => p.player.memberNumber === n)!;
  return { id: r.id, man: share(man), woman: share(woman) };
}

const liveShares = (registrationId: string) =>
  prisma.registrationParticipant.findMany({
    where: { registrationId, active: true },
    include: { player: true },
    orderBy: { role: 'asc' },
  });

describe('changing a doubles partner (D115)', () => {
  it('previews first, then swaps an unpaid partner for a player not yet entered', async () => {
    const { t, gd, admin } = await setup();
    const parthipan = await player({ gender: 'MALE' });
    const placeholder = await player();
    const harshitha = await player();
    const entry = await pair(
      admin,
      t.id,
      gd.id,
      parthipan.profile.memberNumber,
      placeholder.profile.memberNumber,
    );
    const input = { partner: { memberNumber: harshitha.profile.memberNumber } };

    const check = await changePartner(admin, entry.id, input, meta);
    expect(check).toMatchObject({
      preview: {
        oldPartner: { refundCents: 0 },
        newPartner: { memberNumber: harshitha.profile.memberNumber, paidMoves: false },
        from: null,
      },
    });
    // Nothing changed yet.
    expect((await liveShares(entry.id)).map((s) => s.playerId)).toContain(placeholder.profile.id);

    await changePartner(admin, entry.id, { ...input, confirm: true }, meta);
    const shares = await liveShares(entry.id);
    expect(shares.map((s) => [s.player.memberNumber, s.role, s.paymentStatus])).toEqual([
      [parthipan.profile.memberNumber, 'PRIMARY', 'UNPAID'],
      [harshitha.profile.memberNumber, 'PARTNER', 'UNPAID'],
    ]);
    // The old partner shows as a cancelled entry of their own.
    const old = await prisma.registration.findFirstOrThrow({
      where: { participants: { some: { playerId: placeholder.profile.id } } },
    });
    expect(old).toMatchObject({ status: 'CANCELLED' });
    expect(old.cancelReason).toContain('Partner changed');
    expect(await prisma.auditLog.count({ where: { action: 'registration.partnerChange' } })).toBe(
      1,
    );
    // Both players of the new pair and the old partner get an email.
    expect(lastMailTo(harshitha.email).mail?.subject).toContain('Almere Open');
    expect(lastMailTo(placeholder.email).mail?.text).toContain(parthipan.profile.firstName);
  });

  it('moves a player who already plays the category, with their payment (no refunds)', async () => {
    const { t, gd, admin } = await setup();
    const [parthipan, other] = [await player({ gender: 'MALE' }), await player({ gender: 'MALE' })];
    const [p1, harshitha] = [await player(), await player()];
    const a = await pair(
      admin,
      t.id,
      gd.id,
      parthipan.profile.memberNumber,
      p1.profile.memberNumber,
    );
    const b = await pair(
      admin,
      t.id,
      gd.id,
      other.profile.memberNumber,
      harshitha.profile.memberNumber,
    );
    await markShareAsPaid(admin, { participantId: a.man.id }, meta);
    await markShareAsPaid(admin, { participantId: b.woman.id }, meta);
    const input = { partner: { memberNumber: harshitha.profile.memberNumber }, notify: false };

    const check = await changePartner(admin, a.id, input, meta);
    // The partner left behind (unpaid) is cancelled by default.
    expect(check).toMatchObject({
      preview: { newPartner: { paidMoves: true }, from: { defaultChoice: 'cancel' } },
    });
    await changePartner(admin, a.id, { ...input, confirm: true }, meta);

    const shares = await liveShares(a.id);
    expect(shares.map((s) => [s.player.memberNumber, s.paymentStatus])).toEqual([
      [parthipan.profile.memberNumber, 'PAID'],
      [harshitha.profile.memberNumber, 'PAID'],
    ]);
    // Her payment follows her into the entry.
    expect(
      await prisma.orderItem.count({ where: { participantId: b.woman.id, registrationId: a.id } }),
    ).toBe(1);
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
      status: 'CANCELLED',
    });
    expect(await prisma.refund.count()).toBe(0);
  });

  it('refunds an old partner who paid, and keeps a paid partner left behind', async () => {
    const { t, gd, admin } = await setup();
    const [man1, man2] = [await player({ gender: 'MALE' }), await player({ gender: 'MALE' })];
    const [woman1, woman2] = [await player(), await player()];
    const a = await pair(
      admin,
      t.id,
      gd.id,
      man1.profile.memberNumber,
      woman1.profile.memberNumber,
    );
    const b = await pair(
      admin,
      t.id,
      gd.id,
      man2.profile.memberNumber,
      woman2.profile.memberNumber,
    );
    for (const id of [a.woman.id, b.man.id, b.woman.id])
      await markShareAsPaid(admin, { participantId: id }, meta);
    const input = { partner: { memberNumber: woman2.profile.memberNumber }, notify: false };

    expect(await changePartner(admin, a.id, input, meta)).toMatchObject({
      preview: { oldPartner: { refundCents: 1250 }, from: { defaultChoice: 'keep' } },
    });
    await changePartner(admin, a.id, { ...input, confirm: true }, meta);

    // The old partner's €12.50 goes back in full.
    const refunds = await prisma.refund.findMany();
    expect(refunds.map((r) => r.amountCents)).toEqual([1250]);
    // The man left behind keeps his (paid) entry, now without a partner.
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
      status: 'CONFIRMED',
    });
    expect((await liveShares(b.id)).map((s) => [s.playerId, s.role, s.paymentStatus])).toEqual([
      [man2.profile.id, 'PRIMARY', 'PAID'],
    ]);
  });

  it('refuses the same partner, an ineligible one, and checked-in entries', async () => {
    const { t, gd, admin } = await setup();
    const [man, man2] = [await player({ gender: 'MALE' }), await player({ gender: 'MALE' })];
    const woman = await player();
    const a = await pair(admin, t.id, gd.id, man.profile.memberNumber, woman.profile.memberNumber);
    const fields = (memberNumber: string) =>
      changePartner(admin, a.id, { partner: { memberNumber } }, meta).catch(
        (e: { details: { fields: Record<string, string> } }) => e.details.fields,
      );
    expect(await fields(woman.profile.memberNumber)).toEqual({ partner: 'partnerSame' });
    // Mixed doubles needs a woman next to a man.
    expect(await fields(man2.profile.memberNumber)).toEqual({ partner: 'partnerIneligible' });
    await prisma.registrationParticipant.update({
      where: { id: a.man.id },
      data: { checkedInAt: new Date() },
    });
    const other = await player();
    expect(await fields(other.profile.memberNumber)).toEqual({ partner: 'checkedIn' });
  });

  it('is for the organisers only', async () => {
    const { t, gd, admin } = await setup();
    const [man, woman, nosy] = [await player({ gender: 'MALE' }), await player(), await player()];
    const a = await pair(admin, t.id, gd.id, man.profile.memberNumber, woman.profile.memberNumber);
    await expect(
      changePartner(
        nosy.actor,
        a.id,
        { partner: { memberNumber: nosy.profile.memberNumber } },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'notFound' });
  });
});
