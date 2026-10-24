/**
 * Role management: administrators grant or revoke ADMIN and ORGANISER (incl. adding new
 * admins). Every change is audited and the user is notified. The last admin can't be removed.
 */
import { Prisma, prisma, Role } from '@tourneasy/db';
import { fieldErrors, roleChangeSchema } from '@tourneasy/shared';
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { assertAdmin } from './permissions';
import type { Actor } from './session-service';

export function hasRole(actor: Actor | null, role: Role): boolean {
  return !!actor && actor.roles.includes(role);
}

const PAGE_SIZE = 20;

export async function listUsers(actor: Actor, params: { q?: string; page?: number }) {
  assertAdmin(actor);
  const q = params.q?.trim().slice(0, 100);
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const where: Prisma.UserWhereInput = {
    anonymisedAt: null,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { playerProfile: { memberNumber: { equals: q.toUpperCase() } } },
          ],
        }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        roles: { select: { role: true } },
        playerProfile: { select: { memberNumber: true } },
      },
    }),
  ]);
  return {
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      memberNumber: u.playerProfile?.memberNumber ?? null,
      roles: u.roles.map((r) => r.role),
    })),
  };
}

async function notifyRoleChange(userId: string, role: Role, granted: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const locale = user.locale as AppLocale;
  await sendMailSafely(
    await renderEmail(user.email, locale, {
      kind: 'roleChanged',
      name: user.name,
      role: messages[locale].Roles[role],
      granted,
    }),
  );
}

function parseRoleChange(input: unknown) {
  const result = roleChangeSchema.safeParse(input);
  if (!result.success) throw validationError(fieldErrors(result.error));
  return result.data;
}

export async function grantRole(actor: Actor, input: unknown, meta: RequestMeta): Promise<void> {
  assertAdmin(actor);
  const { userId, role } = parseRoleChange(input);
  const target = await prisma.user.findFirst({
    where: { id: userId, anonymisedAt: null, deletedAt: null },
  });
  if (!target) throw new AppError('notFound');

  const result = await prisma.userRole.createMany({
    data: [{ userId, role, grantedById: actor.userId }],
    skipDuplicates: true,
  });
  if (result.count === 0) return; // already had the role

  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'user.role.grant',
    entityType: 'User',
    entityId: userId,
    after: { role },
    meta,
  });
  await notifyRoleChange(userId, role, true);
}

export async function revokeRole(actor: Actor, input: unknown, meta: RequestMeta): Promise<void> {
  assertAdmin(actor);
  const { userId, role } = parseRoleChange(input);

  const removed = await prisma.$transaction(
    async (tx) => {
      if (role === Role.ADMIN) {
        // Serializable + count inside the transaction: two admins can't demote each other
        // at the same moment and leave the platform without an administrator.
        const admins = await tx.userRole.count({
          where: {
            role: Role.ADMIN,
            user: { isActive: true, anonymisedAt: null, deletedAt: null },
          },
        });
        const targetIsAdmin = await tx.userRole.count({ where: { userId, role: Role.ADMIN } });
        if (targetIsAdmin && admins <= 1) throw new AppError('lastAdmin');
      }
      const deleted = await tx.userRole.deleteMany({ where: { userId, role } });
      if (deleted.count > 0) {
        await writeAudit(tx, {
          actorId: actor.userId,
          action: 'user.role.revoke',
          entityType: 'User',
          entityId: userId,
          before: { role },
          meta,
        });
      }
      return deleted.count > 0;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  if (removed) await notifyRoleChange(userId, role, false);
}
