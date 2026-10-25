import { prisma, Role } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import { AppError } from '../lib/errors';
import { authenticate } from './auth-service';
import {
  acceptPlayerInvite,
  getPlayerInvite,
  invitePlayers,
  lastInvites,
} from './player-invite-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function admin() {
  const p = await createPlayer();
  await prisma.userRole.create({ data: { userId: p.userId, role: Role.ADMIN } });
  return (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
}

let n = 0;
async function accountless(email: string | null, dateOfBirth = new Date('1990-05-01')) {
  n += 1;
  return prisma.playerProfile.create({
    data: {
      memberNumber: `TE90000${n}`,
      firstName: 'Ruud',
      lastName: `Bos${n}`,
      dateOfBirth,
      gender: 'MALE',
      contactEmail: email,
    },
  });
}

const password = 'Shuttle-Smash-2027';

describe('account invites for players without an account (D76)', () => {
  it('invites, activates with a password and signs in on the existing profile', async () => {
    const actor = await admin();
    const ruud = await accountless('ruud@example.test');
    const noEmail = await accountless(null);
    const taken = await accountless('player1@example.test'); // the admin's own login email

    const result = await invitePlayers(actor, { ids: [ruud.id, noEmail.id, taken.id] }, 'nl', meta);
    expect(result).toEqual({ sent: 1, skipped: 2 });
    expect((await lastInvites([ruud.id])).has(ruud.id)).toBe(true);

    const { mail, token } = lastMailTo('ruud@example.test');
    expect(mail?.subject).toBe('Je account bij Tourneasy staat klaar');
    expect(mail?.text).toContain(ruud.memberNumber);
    expect(await getPlayerInvite(token!)).toMatchObject({
      firstName: 'Ruud',
      email: 'ruud@example.test',
      minor: false,
    });

    // Terms must be accepted.
    await expect(
      acceptPlayerInvite({ token, password, passwordRepeat: password }, 'nl', meta),
    ).rejects.toBeInstanceOf(AppError);

    const { userId } = await acceptPlayerInvite(
      { token, password, passwordRepeat: password, acceptTerms: true, acceptPrivacy: true },
      'nl',
      meta,
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { playerProfile: true, roles: true, consents: true },
    });
    expect(user.email).toBe('ruud@example.test');
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.playerProfile?.id).toBe(ruud.id);
    expect(user.playerProfile?.contactEmail).toBeNull();
    expect(user.roles.map((r) => r.role)).toEqual(['PLAYER']);
    expect(user.consents).toHaveLength(2);

    // Logs in with the new password; the link can't be used twice.
    await expect(
      authenticate({ identifier: ruud.memberNumber, password }, meta),
    ).resolves.toMatchObject({ userId });
    expect(await getPlayerInvite(token!)).toBeNull();
    await expect(
      acceptPlayerInvite({ token, password, acceptTerms: true, acceptPrivacy: true }, 'nl', meta),
    ).rejects.toMatchObject({ code: 'tokenInvalid' });
  });

  it('a new invite replaces the old link; minors need a guardian', async () => {
    const actor = await admin();
    const kid = await accountless('kid@example.test', new Date(Date.now() - 12 * 365 * 864e5));
    await invitePlayers(actor, { ids: [kid.id] }, 'en', meta);
    const first = lastMailTo('kid@example.test').token!;
    await invitePlayers(actor, { ids: [kid.id] }, 'en', meta);
    const second = lastMailTo('kid@example.test').token!;
    expect(first).not.toBe(second);
    expect(await getPlayerInvite(first)).toBeNull();
    expect(await getPlayerInvite(second)).toMatchObject({ minor: true });

    const base = { token: second, password, acceptTerms: true, acceptPrivacy: true };
    await expect(acceptPlayerInvite(base, 'en', meta)).rejects.toMatchObject({
      code: 'validation',
    });
    const { userId } = await acceptPlayerInvite(
      { ...base, parentalConsent: true, guardianName: 'Mam Bos' },
      'en',
      meta,
    );
    const consents = await prisma.consent.findMany({ where: { userId } });
    expect(consents.map((c) => c.type)).toContain('PARENTAL_CONSENT');
  });

  it('only admins can invite', async () => {
    const p = await createPlayer();
    const player = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
    const ruud = await accountless('ruud2@example.test');
    await expect(invitePlayers(player, { ids: [ruud.id] }, 'nl', meta)).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
