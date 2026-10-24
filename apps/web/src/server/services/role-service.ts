/**
 * Role management: administrators grant or revoke ADMIN and ORGANISER (incl. adding new
 * admins). Every change is audited and the user is notified. The last admin can't be removed.
 */
import { Prisma, prisma, Role } from '@tourneasy/db';
import { fieldErrors, roleChangeSchema } from '@tourneasy/shared';
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { z } from 'zod';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { anonymiseUser } from './gdpr-service';
import { assertAdmin } from './permissions';
import { type Actor, revokeAllSessions } from './session-service';

export function hasRole(actor: Actor | null, role: Role): boolean {
  return !!actor && actor.roles.includes(role);
}

const PAGE_SIZE = 20;

export const USER_SORTS = ['name', 'member', 'email', 'roles', 'created'] as const;
export type UserSort = (typeof USER_SORTS)[number];

function userOrder(sort: UserSort, dir: 'asc' | 'desc'): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case 'member':
      return [{ playerProfile: { memberNumber: dir } }, { name: 'asc' }];
    case 'email':
      return [{ email: dir }];
    // Most roles first (admins and organisers together), then by name.
    case 'roles':
      return [{ roles: { _count: dir === 'asc' ? 'desc' : 'asc' } }, { name: 'asc' }];
    case 'created':
      return [{ createdAt: dir }];
    default:
      return [{ name: dir }, { email: 'asc' }];
  }
}

export async function listUsers(
  actor: Actor,
  params: { q?: string; page?: number; sort?: UserSort; dir?: 'asc' | 'desc' },
) {
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
      orderBy: userOrder(params.sort ?? 'name', params.dir ?? 'asc'),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
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
      createdAt: u.createdAt,
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

const removeUsersSchema = z.object({
  userIds: z.array(z.string().uuid('invalid')).min(1, 'required').max(100, 'invalid'),
  password: z.string().min(1, 'required').max(200),
});

/**
 * Admin: removes accounts in bulk to keep the site clean (D72). Same erasure as a player's own
 * deletion (anonymised; results stay as "Deleted player"). Needs the admin's own password; never
 * the admin themselves, and never admins or organisers (take the role away first). Logged.
 */
export async function removeUsers(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const { userIds, password } = parseInput(removeUsersSchema, input);
  const ids = [...new Set(userIds)];
  if (ids.includes(actor.userId)) throw new AppError('removeSelf');
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { passwordHash: true },
  });
  if (!me.passwordHash || !(await verifyPassword(me.passwordHash, password)))
    throw new AppError('wrongPassword', { fields: { password: 'wrongPassword' } });
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, anonymisedAt: null, deletedAt: null },
    select: { id: true, roles: { select: { role: true } } },
  });
  if (users.some((u) => u.roles.some((r) => r.role !== 'PLAYER')))
    throw new AppError('removeStaff');
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      for (const u of users) {
        await anonymiseUser(tx, u.id, now);
        await writeAudit(tx, {
          actorId: actor.userId,
          action: 'user.delete.byAdmin',
          entityType: 'User',
          entityId: u.id,
          meta,
        });
      }
    },
    { timeout: 60_000 },
  );
  for (const u of users) await revokeAllSessions(u.id);
  return users.length;
}
