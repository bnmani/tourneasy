/** Venues (reusable across tournaments) and their courts. Admin only. */
import { Prisma, prisma, type Province } from '@tourneasy/db';
import { venueSchema } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { localized, uniqueSlug } from '../lib/slug';
import { pageCount, pageParams, parseInput } from '../lib/validation';
import { assertAdmin, assertPortalAccess } from './permissions';
import type { Actor } from './session-service';

export async function listVenues(
  actor: Actor,
  params: { q?: string; archived?: boolean; page?: number } = {},
) {
  assertPortalAccess(actor);
  const { page, skip, take } = pageParams(params.page);
  const q = params.q?.trim();
  const where: Prisma.VenueWhereInput = {
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
  const [total, venues] = await Promise.all([
    prisma.venue.count({ where }),
    prisma.venue.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        city: true,
        province: true,
        numberOfCourts: true,
        deletedAt: true,
      },
    }),
  ]);
  return { venues, total, page, pages: pageCount(total) };
}

/** All active venues, for select boxes. */
export async function venueOptions() {
  return prisma.venue.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, city: true, numberOfCourts: true },
  });
}

export async function getVenue(actor: Actor, id: string) {
  assertPortalAccess(actor);
  const venue = await prisma.venue.findUnique({ where: { id } });
  if (!venue) throw new AppError('notFound');
  return venue;
}

function toData(input: ReturnType<typeof venueSchema.parse>) {
  return {
    name: input.name,
    street: input.street,
    houseNumber: input.houseNumber,
    postcode: input.postcode,
    city: input.city,
    province: input.province as Province,
    country: input.country,
    numberOfCourts: input.numberOfCourts,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    facilities: localized(input.facilities) ?? Prisma.DbNull,
    parkingInfo: localized(input.parkingInfo) ?? Prisma.DbNull,
    publicTransportInfo: localized(input.publicTransportInfo) ?? Prisma.DbNull,
  };
}

/** Keeps Court rows 1..n in line with numberOfCourts (removes only unused extra courts). */
async function syncCourts(tx: Prisma.TransactionClient, venueId: string, count: number) {
  const courts = await tx.court.findMany({
    where: { venueId },
    include: { _count: { select: { slots: true } } },
  });
  const existing = new Set(courts.map((c) => c.number));
  const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !existing.has(n));
  if (missing.length)
    await tx.court.createMany({ data: missing.map((number) => ({ venueId, number })) });
  const removable = courts.filter((c) => c.number > count && c._count.slots === 0).map((c) => c.id);
  if (removable.length) await tx.court.deleteMany({ where: { id: { in: removable } } });
}

export async function createVenue(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const data = toData(parseInput(venueSchema, input));
  const slug = await uniqueSlug(
    `${data.name} ${data.city}`,
    async (s) => !!(await prisma.venue.findUnique({ where: { slug: s } })),
  );
  return prisma.$transaction(async (tx) => {
    const venue = await tx.venue.create({ data: { ...data, slug } });
    await syncCourts(tx, venue.id, data.numberOfCourts);
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'venue.create',
      entityType: 'Venue',
      entityId: venue.id,
      after: { name: venue.name },
      meta,
    });
    return venue;
  });
}

export async function updateVenue(actor: Actor, id: string, input: unknown, meta: RequestMeta) {
  assertAdmin(actor);
  const data = toData(parseInput(venueSchema, input));
  const existing = await prisma.venue.findUnique({ where: { id } });
  if (!existing) throw new AppError('notFound');
  return prisma.$transaction(async (tx) => {
    const venue = await tx.venue.update({ where: { id }, data });
    await syncCourts(tx, id, data.numberOfCourts);
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'venue.update',
      entityType: 'Venue',
      entityId: id,
      before: { name: existing.name, numberOfCourts: existing.numberOfCourts },
      after: { name: venue.name, numberOfCourts: venue.numberOfCourts },
      meta,
    });
    return venue;
  });
}

export async function setVenueArchived(
  actor: Actor,
  id: string,
  archived: boolean,
  meta: RequestMeta,
) {
  assertAdmin(actor);
  if (archived) {
    const upcoming = await prisma.tournament.count({
      where: { venueId: id, deletedAt: null, status: { notIn: ['FINISHED', 'ARCHIVED'] } },
    });
    if (upcoming > 0) throw new AppError('inUse');
  }
  await prisma.venue.update({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: archived ? 'venue.archive' : 'venue.restore',
    entityType: 'Venue',
    entityId: id,
    meta,
  });
}
