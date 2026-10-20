/** Clubs (badminton associations). Admin only. */
import { Prisma, prisma, type Province } from '@tourneasy/db';
import { clubSchema } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { uniqueSlug } from '../lib/slug';
import { pageCount, pageParams, parseInput } from '../lib/validation';
import { assertAdmin, assertPortalAccess } from './permissions';
import type { Actor } from './session-service';

export async function listClubs(
  actor: Actor,
  params: { q?: string; archived?: boolean; page?: number } = {},
) {
  assertPortalAccess(actor);
  const { page, skip, take } = pageParams(params.page);
  const q = params.q?.trim();
  const where: Prisma.ClubWhereInput = {
    deletedAt: params.archived ? { not: null } : null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, clubs] = await Promise.all([
    prisma.club.count({ where }),
    prisma.club.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        city: true,
        province: true,
        deletedAt: true,
        _count: { select: { players: { where: { deletedAt: null } } } },
      },
    }),
  ]);
  return { clubs, total, page, pages: pageCount(total) };
}

export async function getClub(actor: Actor, id: string) {
  assertPortalAccess(actor);
  const club = await prisma.club.findUnique({ where: { id } });
  if (!club) throw new AppError('notFound');
  return club;
}

function toData(input: ReturnType<typeof clubSchema.parse>) {
  return {
    name: input.name,
    shortName: input.shortName ?? null,
    federationCode: input.federationCode ?? null,
    city: input.city ?? null,
    province: (input.province as Province | undefined) ?? null,
    website: input.website ?? null,
    email: input.email ?? null,
    venueId: input.venueId ?? null,
  };
}

function uniqueFederationCode(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw validationError({ federationCode: 'duplicate' });
  }
  throw error;
}

export async function createClub(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const data = toData(parseInput(clubSchema, input));
  const slug = await uniqueSlug(
    data.name,
    async (s) => !!(await prisma.club.findUnique({ where: { slug: s } })),
  );
  const club = await prisma.club.create({ data: { ...data, slug } }).catch(uniqueFederationCode);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'club.create',
    entityType: 'Club',
    entityId: club.id,
    after: { name: club.name },
    meta,
  });
  return club;
}

export async function updateClub(actor: Actor, id: string, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const data = toData(parseInput(clubSchema, input));
  const before = await prisma.club.findUnique({ where: { id } });
  if (!before) throw new AppError('notFound');
  const club = await prisma.club.update({ where: { id }, data }).catch(uniqueFederationCode);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'club.update',
    entityType: 'Club',
    entityId: id,
    before: { name: before.name },
    after: { name: club.name },
    meta,
  });
  return club;
}

export async function setClubArchived(
  actor: Actor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
) {
  assertAdmin(actor);
  await prisma.club.update({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: archived ? 'club.archive' : 'club.restore',
    entityType: 'Club',
    entityId: id,
    meta,
  });
}
