import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import {
  cancelEntryAsOrganiser,
  enterTournament,
  getEntryOptions,
  listMyInvites,
  listMyRegistrations,
  listTournamentEntries,
  respondToInvite,
  searchPartners,
  withdrawMyRegistration,
} from './registration-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

const NOW = new Date('2026-12-01T12:00:00Z');

async function player(overrides: Record<string, unknown> = {}, verified = true) {
  const p = await createPlayer(overrides);
  if (verified) {
    await prisma.user.update({ where: { id: p.userId }, data: { emailVerifiedAt: new Date() } });
  }
  const { token } = await createWebSession(p.userId, meta, true);
  const actor = (await actorFromWebToken(token))!;
  const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: p.userId } });
  return { ...p, actor, profile };
}

async function tournament(overrides: Record<string, unknown> = {}) {
  return prisma.tournament.create({
    data: {
      name: 'Utrecht Open',
      slug: 'utrecht-open',
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-14'),
      registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
      registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
      entryDeadline: new Date('2027-02-27T22:59:00Z'),
      withdrawalDeadline: new Date('2027-02-20T22:59:00Z'),
      status: 'OPEN',
      isPublished: true,
      maxEventsPerPlayer: 2,
      ...overrides,
    },
  });
}

async function event(
  tournamentId: string,
  discipline: 'HE' | 'DE' | 'HD' | 'DD' | 'GD',
  extra = {},
) {
  return prisma.tournamentEvent.create({
    data: { tournamentId, discipline, feeCents: 1500, ...extra },
  });
}

const terms = { acceptTerms: true };

describe('entering a tournament', () => {
  it('confirms an eligible singles entry, stores the terms and emails the player', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE');
    const anna = await player({ firstName: 'Anna' });
    const result = await enterTournament(
      anna.actor,
      'utrecht-open',
      { events: [{ eventId: de.id }], phone: '0687654321', ...terms },
      meta,
      NOW,
    );
    expect(result.registrations).toMatchObject([{ status: 'CONFIRMED', waitlistPosition: null }]);
    const r = await prisma.registration.findFirstOrThrow({ include: { participants: true } });
    expect(r).toMatchObject({ termsVersion: '2026-10', status: 'CONFIRMED' });
    expect(r.participants[0]).toMatchObject({ role: 'PRIMARY', paymentStatus: 'UNPAID' });
    expect(lastMailTo(anna.email).mail?.subject).toContain('Utrecht Open');
    expect(
      (await prisma.playerProfile.findUniqueOrThrow({ where: { id: anna.profile.id } })).phone,
    ).toBe('0687654321');
    // The same event again is refused.
    await expect(
      enterTournament(
        anna.actor,
        'utrecht-open',
        { events: [{ eventId: de.id }], ...terms },
        meta,
        NOW,
      ),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { fields: { [`event.${de.id}`]: 'alreadyEntered' } },
    });
  });

  it('refuses ineligible events, closed entries, unverified emails and too many events', async () => {
    const t = await tournament({ maxEventsPerPlayer: 1 });
    const he = await event(t.id, 'HE');
    const de = await event(t.id, 'DE');
    const de2 = await event(t.id, 'DE', { levelClassId: null, isOpen: true, sortOrder: 2 });
    const anna = await player({ firstName: 'Anna', gender: 'FEMALE' });

    const options = await getEntryOptions(anna.actor, 'utrecht-open', NOW);
    expect(options.events.find((e) => e.id === he.id)?.reasons).toEqual(['gender']);

    await expect(
      enterTournament(
        anna.actor,
        'utrecht-open',
        { events: [{ eventId: he.id }], ...terms },
        meta,
        NOW,
      ),
    ).rejects.toMatchObject({ details: { fields: { [`event.${he.id}`]: 'notEligible' } } });
    await expect(
      enterTournament(
        anna.actor,
        'utrecht-open',
        { events: [{ eventId: de.id }, { eventId: de2.id }], ...terms },
        meta,
        NOW,
      ),
    ).rejects.toMatchObject({ details: { fields: { events: 'maxEvents' } } });
    await expect(
      enterTournament(
        anna.actor,
        'utrecht-open',
        { events: [{ eventId: de.id }], ...terms },
        meta,
        new Date('2027-03-01'),
      ),
    ).rejects.toMatchObject({ code: 'registrationClosed' });

    const unverified = await player({ firstName: 'Bo', gender: 'FEMALE' }, false);
    await expect(
      enterTournament(
        unverified.actor,
        'utrecht-open',
        { events: [{ eventId: de.id }], ...terms },
        meta,
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'emailNotVerified' });
  });

  it('puts entries on the waiting list when full and moves them up after a withdrawal', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE', { maxEntries: 1 });
    const anna = await player({ firstName: 'Anna' });
    const bea = await player({ firstName: 'Bea' });
    const cato = await player({ firstName: 'Cato' });
    await enterTournament(
      anna.actor,
      'utrecht-open',
      { events: [{ eventId: de.id }], ...terms },
      meta,
      NOW,
    );
    const second = await enterTournament(
      bea.actor,
      'utrecht-open',
      { events: [{ eventId: de.id }], ...terms },
      meta,
      NOW,
    );
    const third = await enterTournament(
      cato.actor,
      'utrecht-open',
      { events: [{ eventId: de.id }], ...terms },
      meta,
      NOW,
    );
    expect(second.registrations[0]).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
    expect(third.registrations[0]).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 });

    const [annaEntry] = await listMyRegistrations(anna.actor, NOW);
    await withdrawMyRegistration(anna.actor, annaEntry!.id, { reason: 'Injured' }, meta, NOW);
    const bEntry = await prisma.registration.findUniqueOrThrow({
      where: { id: second.registrations[0]!.id },
    });
    expect(bEntry).toMatchObject({ status: 'CONFIRMED', waitlistPosition: null });
    const cEntry = await prisma.registration.findUniqueOrThrow({
      where: { id: third.registrations[0]!.id },
    });
    expect(cEntry.waitlistPosition).toBe(1);
    expect(lastMailTo(bea.email).mail?.subject).toContain('wachtlijst');
    expect(lastMailTo(anna.email).mail?.subject).toContain('Afgemeld');

    // After the withdrawal deadline players can't withdraw online any more.
    const [beaEntry] = await listMyRegistrations(bea.actor, NOW);
    await expect(
      withdrawMyRegistration(bea.actor, beaEntry!.id, {}, meta, new Date('2027-02-21T12:00:00Z')),
    ).rejects.toMatchObject({ code: 'withdrawalClosed' });
  });
});

describe('doubles partners', () => {
  it('invites a known partner who accepts; others cannot answer for them', async () => {
    const t = await tournament();
    const gd = await event(t.id, 'GD');
    const anna = await player({ firstName: 'Anna', gender: 'FEMALE' });
    const bram = await player({ firstName: 'Bram', gender: 'MALE' });
    const eve = await player({ firstName: 'Eve', gender: 'FEMALE' });

    await expect(
      enterTournament(
        anna.actor,
        'utrecht-open',
        { events: [{ eventId: gd.id, partner: eve.profile.memberNumber }], ...terms },
        meta,
        NOW,
      ),
    ).rejects.toMatchObject({ details: { fields: { [`partner.${gd.id}`]: 'partnerIneligible' } } });
    await expect(
      enterTournament(
        anna.actor,
        'utrecht-open',
        { events: [{ eventId: gd.id }], ...terms },
        meta,
        NOW,
      ),
    ).rejects.toMatchObject({ details: { fields: { [`partner.${gd.id}`]: 'partnerRequired' } } });

    await enterTournament(
      anna.actor,
      'utrecht-open',
      { events: [{ eventId: gd.id, partner: bram.profile.memberNumber.toLowerCase() }], ...terms },
      meta,
      NOW,
    );
    const { token } = lastMailTo(bram.email);
    const inviteLink = lastMailTo(bram.email).link!;
    expect(inviteLink).toContain('/invites/');
    const inviteToken = inviteLink.split('/invites/')[1]!;
    expect(token).toBeNull();

    await expect(
      respondToInvite(eve.actor, { token: inviteToken }, true, meta, NOW),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    await respondToInvite(bram.actor, { token: inviteToken }, true, meta, NOW);
    const [entry] = await listMyRegistrations(anna.actor, NOW);
    expect(entry).toMatchObject({
      partner: { name: expect.stringContaining('Bram') },
      pendingInvite: null,
    });
    expect(lastMailTo(anna.email).mail?.subject).toContain('Bram');
    await expect(
      respondToInvite(bram.actor, { token: inviteToken }, true, meta, NOW),
    ).rejects.toMatchObject({
      code: 'inviteInvalid',
    });
  });

  it('invites someone without an account by email; after sign-up they find and accept it', async () => {
    const t = await tournament();
    const hd = await event(t.id, 'HD');
    const bram = await player({ firstName: 'Bram', gender: 'MALE' });
    await enterTournament(
      bram.actor,
      'utrecht-open',
      { events: [{ eventId: hd.id, partner: 'new.partner@example.test' }], ...terms },
      meta,
      NOW,
    );
    expect(lastMailTo('new.partner@example.test').link).toContain('/invites/');
    const newcomer = await player({
      firstName: 'Nico',
      gender: 'MALE',
      email: 'new.partner@example.test',
    });
    const invites = await listMyInvites(newcomer.actor, NOW);
    expect(invites).toHaveLength(1);
    await respondToInvite(newcomer.actor, { id: invites[0]!.id }, true, meta, NOW);
    const r = await prisma.registration.findFirstOrThrow({ include: { participants: true } });
    expect(r.participants.map((p) => p.role).sort()).toEqual(['PARTNER', 'PRIMARY']);
  });

  it('lets a player enter without a partner as "looking for a partner"', async () => {
    const t = await tournament();
    const dd = await event(t.id, 'DD');
    const anna = await player({ firstName: 'Anna', gender: 'FEMALE' });
    await enterTournament(
      anna.actor,
      'utrecht-open',
      { events: [{ eventId: dd.id, lookingForPartner: true }], ...terms },
      meta,
      NOW,
    );
    const [entry] = await listMyRegistrations(anna.actor, NOW);
    expect(entry).toMatchObject({ lookingForPartner: true, partner: null, status: 'CONFIRMED' });
  });
});

describe('organiser entry list', () => {
  it('shows entries to admins, not to other players, and cancelling moves the waiting list up', async () => {
    const t = await tournament();
    const de = await event(t.id, 'DE', { maxEntries: 1 });
    const anna = await player({ firstName: 'Anna' });
    const bea = await player({ firstName: 'Bea' });
    await enterTournament(
      anna.actor,
      'utrecht-open',
      { events: [{ eventId: de.id }], ...terms },
      meta,
      NOW,
    );
    await enterTournament(
      bea.actor,
      'utrecht-open',
      { events: [{ eventId: de.id }], ...terms },
      meta,
      NOW,
    );

    // Non-organisers get notFound (the portal does not reveal tournaments they cannot manage).
    await expect(listTournamentEntries(anna.actor, t.id)).rejects.toMatchObject({
      code: 'notFound',
    });
    const admin = await player({ firstName: 'Admin' });
    await prisma.userRole.create({ data: { userId: admin.userId, role: Role.ADMIN } });
    const adminActor = (await actorFromWebToken(
      (await createWebSession(admin.userId, meta, true)).token,
    ))!;
    const entries = await listTournamentEntries(adminActor, t.id);
    expect(entries.map((e) => e.status)).toEqual(['CONFIRMED', 'WAITLISTED']);

    await cancelEntryAsOrganiser(adminActor, entries[0]!.id, { reason: 'No-show' }, meta, NOW);
    const after = await listTournamentEntries(adminActor, t.id);
    expect(after.map((e) => e.status)).toEqual(['CONFIRMED']);
    expect(after[0]!.participants[0]!.player.firstName).toBe('Bea');
    expect(
      await prisma.auditLog.count({ where: { action: 'registration.cancelByOrganiser' } }),
    ).toBe(1);
  });
});

describe('partner search (D59)', () => {
  it('suggests only players who may partner me in this event, without contact details', async () => {
    const t = await tournament();
    const gd = await event(t.id, 'GD');
    const anna = await player({ firstName: 'Anna', gender: 'FEMALE' });
    const bram = await player({ firstName: 'Bram', lastName: 'Jansen', gender: 'MALE' });
    await player({ firstName: 'Bea', lastName: 'Jansen', gender: 'FEMALE' }); // same gender: not for mixed
    const taken = await player({ firstName: 'Bart', lastName: 'Jansen', gender: 'MALE' });
    await enterTournament(
      taken.actor,
      'utrecht-open',
      { events: [{ eventId: gd.id, lookingForPartner: true }], ...terms },
      meta,
      NOW,
    );

    const found = await searchPartners(anna.actor, 'utrecht-open', gd.id, 'jans');
    expect(found).toEqual([
      { memberNumber: bram.profile.memberNumber, name: 'Bram Jansen', club: null },
    ]);
    expect(
      await searchPartners(
        anna.actor,
        'utrecht-open',
        gd.id,
        bram.profile.memberNumber.toLowerCase(),
      ),
    ).toHaveLength(1);
    expect(await searchPartners(anna.actor, 'utrecht-open', gd.id, 'j')).toEqual([]);
    // Searching for myself never returns me.
    expect(await searchPartners(anna.actor, 'utrecht-open', gd.id, 'Anna')).toEqual([]);
  });
});
