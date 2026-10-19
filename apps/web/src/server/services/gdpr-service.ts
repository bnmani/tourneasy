/**
 * GDPR/AVG rights: data export (art. 15/20) and erasure by anonymisation (art. 17).
 * Rows referenced by tournaments, payments and results are kept but stripped of personal data.
 */
import { prisma } from '@tourneasy/db';
import { deleteAccountSchema, fieldErrors } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { type Actor, revokeAllSessions } from './session-service';

export async function exportMyData(actor: Actor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    include: {
      roles: { select: { role: true, createdAt: true } },
      consents: {
        select: { type: true, version: true, granted: true, grantedBy: true, createdAt: true },
      },
      sessions: {
        select: {
          kind: true,
          deviceName: true,
          ipAddress: true,
          createdAt: true,
          lastSeenAt: true,
          revokedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      playerProfile: {
        include: {
          club: { select: { name: true } },
          participations: {
            include: {
              registration: {
                include: { event: { include: { tournament: { select: { name: true } } } } },
              },
            },
          },
        },
      },
      orders: {
        include: {
          items: true,
          payments: { select: { amountCents: true, status: true, method: true, createdAt: true } },
        },
      },
      following: { select: { followedPlayerId: true, createdAt: true } },
    },
  });
  if (!user) throw new AppError('notFound');

  // Never export secrets or security internals (undefined fields are dropped from JSON).
  const account = {
    ...user,
    passwordHash: undefined,
    failedLoginCount: undefined,
    lockedUntil: undefined,
  };
  return {
    exportedAt: new Date().toISOString(),
    format: 'tourneasy-data-export/1',
    account,
  };
}

export async function deleteMyAccount(actor: Actor, input: unknown): Promise<void> {
  const result = deleteAccountSchema.safeParse(input);
  if (!result.success) throw validationError(fieldErrors(result.error));

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    include: { roles: true },
  });
  if (!user || user.anonymisedAt) throw new AppError('notFound');
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, result.data.password))) {
    throw new AppError('wrongPassword', { fields: { password: 'wrongPassword' } });
  }
  if (user.roles.some((r) => r.role === 'ADMIN')) {
    const admins = await prisma.userRole.count({
      where: { role: 'ADMIN', user: { isActive: true, anonymisedAt: null, deletedAt: null } },
    });
    if (admins <= 1) throw new AppError('lastAdmin');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: `deleted+${user.id}@invalid.tourneasy`,
        name: 'Deleted user',
        passwordHash: null,
        image: null,
        isActive: false,
        anonymisedAt: now,
        deletedAt: now,
        emailVerifiedAt: null,
      },
    });
    const profile = await tx.playerProfile.findUnique({ where: { userId: user.id } });
    if (profile) {
      const dob = profile.dateOfBirth;
      await tx.playerProfile.update({
        where: { id: profile.id },
        data: {
          firstName: 'Deleted',
          lastNamePrefix: null,
          lastName: 'player',
          // Keep only the birth year: results by age category stay meaningful.
          dateOfBirth: new Date(Date.UTC(dob.getUTCFullYear(), 0, 1)),
          phone: null,
          nationality: null,
          federationId: null,
          photoKey: null,
          emergencyName: null,
          emergencyPhone: null,
          publicProfile: false,
          deletedAt: now,
        },
      });
    }
    await tx.userRole.deleteMany({ where: { userId: user.id, role: { not: 'PLAYER' } } });
    await tx.deviceToken.deleteMany({ where: { userId: user.id } });
    await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
    await tx.playerFollow.deleteMany({ where: { followerUserId: user.id } });
    await tx.verificationToken.deleteMany({ where: { identifier: `email-verify:${user.id}` } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.userSession.updateMany({
      where: { userId: user.id },
      data: { ipAddress: null, userAgent: null, deviceName: null },
    });
    await writeAudit(tx, {
      actorId: user.id,
      action: 'user.delete.anonymise',
      entityType: 'User',
      entityId: user.id,
      // No IP/user agent: an erasure shouldn't create new personal data.
    });
  });
  await revokeAllSessions(user.id);
}

/** Consents I have given (shown on the privacy page). */
export async function listMyConsents(actor: Actor) {
  return prisma.consent.findMany({
    where: { userId: actor.userId, granted: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, version: true, createdAt: true },
  });
}
