/**
 * Invites for players without an account (D76). An admin sends a link to the player's contact
 * email; opening it proves the address, the player picks a password, accepts the terms and is
 * signed in with the existing profile (member number, entries and results stay).
 */
import { ConsentType, type Locale, Prisma, prisma, Role } from '@tourneasy/db';
import { acceptPlayerInviteSchema, fieldErrors, isMinor } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { z } from 'zod';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { hashToken, randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import { hashPassword } from '../lib/password';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { POLICY_VERSION } from './auth-service';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';
import { acceptOrganiserInvites } from './tournament-service';

export const PLAYER_INVITE_TTL_DAYS = 14;
const MAX_PER_BATCH = 500;

const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_PER_BATCH) });

/** Players that can get an invite: no account, a contact email nobody uses as login. */
async function invitable(ids: string[]) {
  const players = await prisma.playerProfile.findMany({
    where: {
      id: { in: ids },
      userId: null,
      deletedAt: null,
      mergedIntoId: null,
      contactEmail: { not: null },
    },
    select: { id: true, firstName: true, memberNumber: true, contactEmail: true },
  });
  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: players.map((p) => p.contactEmail!) } },
        select: { email: true },
      })
    ).map((u) => u.email.toLowerCase()),
  );
  return players.filter((p) => !taken.has(p.contactEmail!.toLowerCase()));
}

/** Sends (or re-sends) the invite; an earlier unused link stops working. */
export async function invitePlayers(
  actor: Actor,
  input: unknown,
  locale: AppLocale,
  meta: RequestMeta,
): Promise<{ sent: number; skipped: number }> {
  assertAdmin(actor);
  const parsed = idsSchema.safeParse(input);
  if (!parsed.success) throw validationError({ ids: 'required' });
  const ids = [...new Set(parsed.data.ids)];
  const players = await invitable(ids);
  const expiresAt = new Date(Date.now() + PLAYER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  for (const p of players) {
    const token = randomToken();
    await prisma.$transaction(async (tx) => {
      await tx.playerInvite.deleteMany({ where: { playerId: p.id, usedAt: null } });
      await tx.playerInvite.create({
        data: {
          playerId: p.id,
          email: p.contactEmail!,
          tokenHash: hashToken(token),
          expiresAt,
          invitedById: actor.userId,
        },
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'player.invite',
        entityType: 'PlayerProfile',
        entityId: p.id,
        meta,
      });
    });
    // Respects the email pause (D64): while testing, invites only reach allowed addresses.
    await sendMailSafely(
      await renderEmail(p.contactEmail!, locale, {
        kind: 'accountInvite',
        name: p.firstName,
        memberNumber: p.memberNumber,
        url: appUrl(locale, `/activate?token=${encodeURIComponent(token)}`),
      }),
    );
  }
  return { sent: players.length, skipped: ids.length - players.length };
}

/** Latest invite per player, for the admin lists ("invited on …"). */
export async function lastInvites(playerIds: string[]): Promise<Map<string, Date>> {
  if (!playerIds.length) return new Map();
  const rows = await prisma.playerInvite.groupBy({
    by: ['playerId'],
    where: { playerId: { in: playerIds }, usedAt: null },
    _max: { createdAt: true },
  });
  return new Map(rows.map((r) => [r.playerId, r._max.createdAt!]));
}

async function validInvite(token: string) {
  const invite = await prisma.playerInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      player: {
        select: {
          id: true,
          userId: true,
          deletedAt: true,
          firstName: true,
          lastNamePrefix: true,
          lastName: true,
          memberNumber: true,
          dateOfBirth: true,
          contactEmail: true,
        },
      },
    },
  });
  if (
    !invite ||
    invite.usedAt ||
    invite.expiresAt <= new Date() ||
    invite.player.userId ||
    invite.player.deletedAt ||
    invite.player.contactEmail?.toLowerCase() !== invite.email.toLowerCase()
  )
    return null;
  return invite;
}

/** What the activation page shows; null when the link is unknown, used or expired. */
export async function getPlayerInvite(token: string) {
  const invite = await validInvite(token);
  if (!invite) return null;
  return {
    firstName: invite.player.firstName,
    memberNumber: invite.player.memberNumber,
    email: invite.email,
    minor: isMinor(invite.player.dateOfBirth),
  };
}

/** Creates the account on the existing profile; returns the new user for the session. */
export async function acceptPlayerInvite(
  input: unknown,
  locale: AppLocale,
  meta: RequestMeta,
): Promise<{ userId: string }> {
  const result = acceptPlayerInviteSchema.safeParse(input);
  if (!result.success) throw validationError(fieldErrors(result.error));
  const data = result.data;
  const invite = await validInvite(data.token);
  if (!invite) throw new AppError('tokenInvalid');
  const minor = isMinor(invite.player.dateOfBirth);
  if (minor && (!data.parentalConsent || !data.guardianName)) {
    throw validationError({
      ...(data.parentalConsent ? {} : { parentalConsent: 'parentalConsentRequired' }),
      ...(data.guardianName ? {} : { guardianName: 'required' }),
    });
  }

  const passwordHash = await hashPassword(data.password);
  const now = new Date();
  const p = invite.player;
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

  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const claimed = await tx.playerInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new AppError('tokenInvalid');
      const user = await tx.user.create({
        data: {
          email: invite.email,
          // Opening the emailed link proves the address.
          emailVerifiedAt: now,
          name: [p.firstName, p.lastNamePrefix, p.lastName].filter(Boolean).join(' '),
          passwordHash,
          locale: locale as Locale,
          roles: { create: [{ role: Role.PLAYER }] },
          consents: { create: consents },
        },
      });
      const linked = await tx.playerProfile.updateMany({
        where: { id: p.id, userId: null },
        data: {
          userId: user.id,
          contactEmail: null,
          isMinor: minor,
          parentalConsentAt: minor ? now : null,
        },
      });
      if (linked.count !== 1) throw new AppError('tokenInvalid');
      await tx.playerInvite.deleteMany({ where: { playerId: p.id, usedAt: null } });
      await writeAudit(tx, {
        actorId: user.id,
        action: 'user.signup.invite',
        entityType: 'User',
        entityId: user.id,
        meta,
      });
      return user.id;
    });
  } catch (error) {
    // Someone signed up with this email in the meantime: they should log in instead.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('emailTaken');
    }
    throw error;
  }
  await acceptOrganiserInvites(userId, invite.email);
  return { userId };
}
