import { prisma } from '@tourneasy/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, lastMailTo, meta, resetDatabase } from '@/test/db';
import { AppError } from '../lib/errors';
import {
  authenticate,
  changePassword,
  MAX_FAILED_LOGINS,
  requestPasswordReset,
  resetPassword,
  signUp,
  verifyEmail,
} from './auth-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((e: AppError) => expect(e.code).toBe(code));
}

describe('signUp', () => {
  it('creates user, player profile, consents and member number, and emails a verify link', async () => {
    const { userId, memberNumber, email } = await createPlayer({
      preferredDisciplines: ['DE', 'GD'],
      phone: '+31 6 1234 5678',
    });
    expect(memberNumber).toBe('TE100001');

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: true, consents: true, playerProfile: true },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.roles.map((r) => r.role)).toEqual(['PLAYER']);
    expect(user.consents.map((c) => c.type).sort()).toEqual(['PRIVACY_POLICY', 'TERMS']);
    expect(user.playerProfile).toMatchObject({
      phone: '+31612345678',
      preferredDisciplines: ['DE', 'GD'],
      publicProfile: false,
      isMinor: false,
    });

    const { mail, link } = lastMailTo(email);
    expect(mail?.subject).toBe('Bevestig je e-mailadres');
    expect(mail?.text).toContain('TE100001');
    expect(link).toMatch(/^https:\/\/test\.example\/nl\/verify-email\?token=/);
  });

  it('records parental consent for under-16s and keeps them private', async () => {
    const year = new Date().getUTCFullYear() - 13;
    const { userId } = await createPlayer({
      dateOfBirth: `${year}-03-01`,
      parentalConsent: true,
      guardianName: 'Ouder Test',
    });
    const consents = await prisma.consent.findMany({ where: { userId } });
    expect(consents.find((c) => c.type === 'PARENTAL_CONSENT')?.grantedBy).toBe('Ouder Test');
    const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile.isMinor).toBe(true);
    expect(profile.parentalConsentAt).not.toBeNull();
  });

  it('rejects a duplicate email, case-insensitively', async () => {
    await createPlayer({ email: 'same@example.test' });
    await expectAppError(createPlayer({ email: 'SAME@example.test' }), 'emailTaken');
  });

  it('returns field errors for invalid input', async () => {
    const promise = signUp({ email: 'nope' }, meta);
    await promise.catch((e: AppError) => {
      expect(e.code).toBe('validation');
      expect(e.details.fields).toMatchObject({ email: 'emailInvalid', firstName: 'required' });
    });
  });
});

describe('authenticate', () => {
  it('accepts email or member number', async () => {
    const { userId, memberNumber, email, password } = await createPlayer();
    expect((await authenticate({ identifier: email.toUpperCase(), password }, meta)).userId).toBe(
      userId,
    );
    expect(
      (await authenticate({ identifier: memberNumber.toLowerCase(), password }, meta)).userId,
    ).toBe(userId);
  });

  it('gives the same error for unknown users and wrong passwords', async () => {
    const { email } = await createPlayer();
    await expectAppError(
      authenticate({ identifier: email, password: 'wrong-password' }, meta),
      'invalidCredentials',
    );
    await expectAppError(
      authenticate({ identifier: 'nobody@example.test', password: 'wrong-password' }, meta),
      'invalidCredentials',
    );
  });

  it(`locks the account after ${MAX_FAILED_LOGINS} failed attempts`, async () => {
    const { email, password } = await createPlayer();
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      await expectAppError(
        authenticate({ identifier: email, password: 'wrong-password' }, meta),
        'invalidCredentials',
      );
    }
    await expectAppError(
      authenticate({ identifier: email, password: 'wrong-password' }, meta),
      'accountLocked',
    );
    // Even the right password is refused while locked.
    await expectAppError(authenticate({ identifier: email, password }, meta), 'accountLocked');
  });

  it('rate-limits repeated attempts for one identifier', async () => {
    const attempts = Array.from({ length: 11 }, () =>
      authenticate({ identifier: 'TE999999', password: 'x' }, meta).catch((e: AppError) => e.code),
    );
    const codes = [];
    for (const attempt of attempts) codes.push(await attempt);
    expect(codes).toContain('rateLimited');
  });
});

describe('email verification', () => {
  it('verifies with the emailed token, once', async () => {
    const { userId, email } = await createPlayer();
    const { token } = lastMailTo(email);
    await verifyEmail({ token });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
    await expectAppError(verifyEmail({ token }), 'tokenInvalid');
  });

  it('rejects expired tokens', async () => {
    const { email } = await createPlayer();
    const { token } = lastMailTo(email);
    await prisma.verificationToken.updateMany({ data: { expires: new Date(Date.now() - 1000) } });
    await expectAppError(verifyEmail({ token }), 'tokenInvalid');
  });
});

describe('password reset', () => {
  it('is silent for unknown emails', async () => {
    await expect(
      requestPasswordReset({ email: 'ghost@example.test' }, meta),
    ).resolves.toBeUndefined();
    expect(lastMailTo('ghost@example.test').mail).toBeUndefined();
  });

  it('resets once, logs out everywhere and verifies the email', async () => {
    const { userId, email } = await createPlayer();
    const session = await createWebSession(userId, meta, true);

    await requestPasswordReset({ email }, meta);
    const { token, mail } = lastMailTo(email);
    expect(mail?.subject).toBe('Nieuw wachtwoord kiezen');

    await resetPassword({ token, password: 'Brand-New-Racket-77' }, meta);
    expect(await actorFromWebToken(session.token)).toBeNull();
    expect(
      (await authenticate({ identifier: email, password: 'Brand-New-Racket-77' }, meta)).userId,
    ).toBe(userId);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt,
    ).not.toBeNull();
    await expectAppError(
      resetPassword({ token, password: 'Another-Password-88' }, meta),
      'tokenInvalid',
    );
  });
});

describe('changePassword', () => {
  it('requires the current password and keeps only the current session', async () => {
    const { userId, password } = await createPlayer();
    const here = await createWebSession(userId, meta, true);
    const other = await createWebSession(userId, meta, true);
    const actor = (await actorFromWebToken(here.token))!;

    await expectAppError(
      changePassword(actor, { currentPassword: 'wrong', newPassword: 'New-Password-2028' }, meta),
      'wrongPassword',
    );
    await changePassword(
      actor,
      { currentPassword: password, newPassword: 'New-Password-2028' },
      meta,
    );
    expect(await actorFromWebToken(here.token)).not.toBeNull();
    expect(await actorFromWebToken(other.token)).toBeNull();
  });
});
