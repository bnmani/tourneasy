/**
 * Accounts: sign-up, login (email or member number), email verification and passwords.
 * Framework-free: called by server actions, REST handlers and tests alike.
 */
import { ConsentType, Locale, Prisma, prisma, Role } from '@tourneasy/db';
import {
  changePasswordSchema,
  fieldErrors,
  forgotPasswordSchema,
  isMinor,
  loginSchema,
  parseDateOnly,
  parseLoginIdentifier,
  resetPasswordSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import type { z } from 'zod';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { hashToken, randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../lib/password';
import { enforce, LIMITS } from '../lib/rate-limit';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { type Actor, revokeAllSessions } from './session-service';
import { acceptOrganiserInvites } from './tournament-service';

/** Version stamped on consent records; bump when the terms/privacy texts change. */
export const POLICY_VERSION = '2026-10';
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(fieldErrors(result.error));
  return result.data;
}

function displayName(first: string, prefix: string | undefined, last: string): string {
  return [first, prefix, last].filter(Boolean).join(' ');
}

// ── Sign-up ────────────────────────────────────────────────────────────────────────

export async function signUp(input: unknown, meta: RequestMeta) {
  const data = parse(signUpSchema, input);
  await enforce(`signup:ip:${meta.ip ?? 'unknown'}`, LIMITS.signUpPerIp);

  const dateOfBirth = parseDateOnly(data.dateOfBirth)!;
  const minor = isMinor(dateOfBirth);
  const passwordHash = await hashPassword(data.password);
  const now = new Date();
  const name = displayName(data.firstName, data.lastNamePrefix, data.lastName);

  let created: { userId: string; memberNumber: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      // A player an admin added earlier with this email is claimed instead of duplicated (D5).
      const claimable = await tx.playerProfile.findFirst({
        where: { contactEmail: data.email, userId: null, deletedAt: null, mergedIntoId: null },
      });
      let memberNumber = claimable?.memberNumber;
      if (!memberNumber) {
        const [row] = await tx.$queryRaw<{ value: bigint }[]>`
          SELECT nextval('member_number_seq') AS value`;
        memberNumber = `TE${row!.value.toString()}`;
      }
      const profileFields = {
        firstName: data.firstName,
        lastNamePrefix: data.lastNamePrefix ?? null,
        lastName: data.lastName,
        dateOfBirth,
        gender: data.gender,
        phone: data.phone,
        preferredDisciplines: data.preferredDisciplines,
        isMinor: minor,
        parentalConsentAt: minor ? now : null,
        // Privacy by default: players opt in to public listings later.
        publicProfile: false,
      };

      const consents: Prisma.ConsentCreateWithoutUserInput[] = [
        { type: ConsentType.TERMS, version: POLICY_VERSION, granted: true, ipAddress: meta.ip },
        {
          type: ConsentType.PRIVACY_POLICY,
          version: POLICY_VERSION,
          granted: true,
          ipAddress: meta.ip,
        },
      ];
      if (minor) {
        consents.push({
          type: ConsentType.PARENTAL_CONSENT,
          version: POLICY_VERSION,
          granted: true,
          grantedBy: data.guardianName,
          ipAddress: meta.ip,
        });
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          name,
          passwordHash,
          locale: data.locale as Locale,
          roles: { create: [{ role: Role.PLAYER }] },
          consents: { create: consents },
          ...(claimable ? {} : { playerProfile: { create: { memberNumber, ...profileFields } } }),
        },
      });
      if (claimable) {
        await tx.playerProfile.update({
          where: { id: claimable.id },
          data: { ...profileFields, userId: user.id, contactEmail: null },
        });
      }
      await writeAudit(tx, {
        actorId: user.id,
        action: claimable ? 'user.signup.claim' : 'user.signup',
        entityType: 'User',
        entityId: user.id,
        meta,
      });
      return { userId: user.id, memberNumber };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('emailTaken', { fields: { email: 'emailTaken' } });
    }
    throw error;
  }

  await acceptOrganiserInvites(created.userId, data.email);
  await sendVerificationEmail(created.userId);
  return created;
}

// ── Login ──────────────────────────────────────────────────────────────────────────

export async function authenticate(input: unknown, meta: RequestMeta) {
  const data = parse(loginSchema, input);
  const identifier = parseLoginIdentifier(data.identifier);

  // Limits instead of an account lock (D84): the same for known and unknown accounts, and
  // tries from one address can't lock the owner out on another.
  await enforce(`login:ip:${meta.ip ?? 'unknown'}`, LIMITS.loginPerIp);
  await enforce(
    `login:idip:${identifier.value}:${meta.ip ?? 'unknown'}`,
    LIMITS.loginPerIdentifierIp,
  );
  await enforce(`login:id:${identifier.value}`, LIMITS.loginPerIdentifier);

  const user =
    identifier.kind === 'email'
      ? await prisma.user.findUnique({ where: { email: identifier.value } })
      : ((
          await prisma.playerProfile.findUnique({
            where: { memberNumber: identifier.value },
            include: { user: true },
          })
        )?.user ?? null);

  if (!user || !user.passwordHash || !user.isActive || user.deletedAt || user.anonymisedAt) {
    await burnPasswordCheck(data.password);
    throw new AppError('invalidCredentials');
  }

  if (!(await verifyPassword(user.passwordHash, data.password))) {
    // Kept as a count for the security log; no longer locks the account (D84).
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
    });
    throw new AppError('invalidCredentials');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  // Organiser invites sent to this email before the account existed.
  await acceptOrganiserInvites(user.id, user.email);
  return { userId: user.id, rememberMe: data.rememberMe, locale: user.locale as AppLocale };
}

// ── Email verification ─────────────────────────────────────────────────────────────

const verifyIdentifier = (userId: string) => `email-verify:${userId}`;

export async function sendVerificationEmail(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { playerProfile: { select: { memberNumber: true, firstName: true } } },
  });
  if (!user || user.emailVerifiedAt) return;

  const token = randomToken();
  await prisma.$transaction([
    // Only the newest link stays valid.
    prisma.verificationToken.deleteMany({ where: { identifier: verifyIdentifier(userId) } }),
    prisma.verificationToken.create({
      data: {
        identifier: verifyIdentifier(userId),
        token: hashToken(token),
        expires: new Date(Date.now() + VERIFY_TTL_MS),
      },
    }),
  ]);

  const locale = user.locale as AppLocale;
  await sendMailSafely(
    await renderEmail(user.email, locale, {
      kind: 'verifyEmail',
      name: user.playerProfile?.firstName ?? user.name,
      memberNumber: user.playerProfile?.memberNumber ?? '',
      url: appUrl(locale, `/verify-email?token=${encodeURIComponent(token)}`),
    }),
    { always: true },
  );
}

/** Whether the account's email address is confirmed (for the page waiting on it). */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  });
  return !!user?.emailVerifiedAt;
}

export async function resendVerificationEmail(actor: Actor): Promise<void> {
  await enforce(`verify-resend:${actor.userId}`, LIMITS.verifyResendPerUser);
  await sendVerificationEmail(actor.userId);
}

export async function verifyEmail(input: unknown): Promise<{ userId: string }> {
  const { token } = parse(verifyEmailSchema, input);
  const stored = await prisma.verificationToken.findUnique({ where: { token: hashToken(token) } });
  if (!stored || !stored.identifier.startsWith('email-verify:') || stored.expires <= new Date()) {
    throw new AppError('tokenInvalid');
  }
  const userId = stored.identifier.slice('email-verify:'.length);
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: stored.identifier } }),
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return { userId };
}

// ── Passwords ──────────────────────────────────────────────────────────────────────

/** Always succeeds from the caller's view, so it can't be used to discover accounts. */
export async function requestPasswordReset(input: unknown, meta: RequestMeta): Promise<void> {
  const { email } = parse(forgotPasswordSchema, input);
  await enforce(`reset:ip:${meta.ip ?? 'unknown'}`, LIMITS.passwordResetPerIp);
  await enforce(`reset:email:${email}`, LIMITS.passwordResetPerEmail);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { playerProfile: { select: { firstName: true } } },
  });
  if (!user || !user.isActive || user.deletedAt || user.anonymisedAt) return;

  const token = randomToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    }),
  ]);

  const locale = user.locale as AppLocale;
  await sendMailSafely(
    await renderEmail(user.email, locale, {
      kind: 'resetPassword',
      name: user.playerProfile?.firstName ?? user.name,
      url: appUrl(locale, `/reset-password?token=${encodeURIComponent(token)}`),
    }),
    { always: true },
  );
}

export async function resetPassword(input: unknown, meta: RequestMeta): Promise<void> {
  const { token, password } = parse(resetPasswordSchema, input);
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { playerProfile: { select: { firstName: true } } } } },
  });
  if (!stored || stored.usedAt || stored.expiresAt <= new Date())
    throw new AppError('tokenInvalid');

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError('tokenInvalid');
    await tx.user.update({
      where: { id: stored.userId },
      // Proving control of the mailbox also verifies the email address.
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerifiedAt: stored.user.emailVerifiedAt ?? new Date(),
      },
    });
    await writeAudit(tx, {
      actorId: stored.userId,
      action: 'auth.password.reset',
      entityType: 'User',
      entityId: stored.userId,
      meta,
    });
  });
  await revokeAllSessions(stored.userId);
  await sendPasswordChangedEmail(stored.user);
}

export async function changePassword(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
): Promise<void> {
  const { currentPassword, newPassword } = parse(changePasswordSchema, input);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    include: { playerProfile: { select: { firstName: true } } },
  });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError('wrongPassword', { fields: { currentPassword: 'wrongPassword' } });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await writeAudit(prisma, {
    actorId: user.id,
    action: 'auth.password.change',
    entityType: 'User',
    entityId: user.id,
    meta,
  });
  // Stay logged in here, log out everywhere else.
  await revokeAllSessions(user.id, actor.sessionId);
  await sendPasswordChangedEmail(user);
}

async function sendPasswordChangedEmail(user: {
  email: string;
  name: string;
  locale: string;
  playerProfile: { firstName: string } | null;
}): Promise<void> {
  await sendMailSafely(
    await renderEmail(user.email, user.locale as AppLocale, {
      kind: 'passwordChanged',
      name: user.playerProfile?.firstName ?? user.name,
    }),
    { always: true },
  );
}
