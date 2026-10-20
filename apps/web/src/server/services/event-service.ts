/** Events of a tournament ("tournament setup"): category, level, fee, capacity, format. */
import { Prisma, prisma, type Discipline, type DrawType } from '@tourneasy/db';
import { eventSchema } from '@tourneasy/shared';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { localized } from '../lib/slug';
import { parseInput } from '../lib/validation';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';

function toData(input: ReturnType<typeof eventSchema.parse>) {
  const groups = input.drawType === 'GROUPS_KNOCKOUT';
  const hybrid = input.drawType === 'HYBRID_ROUND_ROBIN_KNOCKOUT';
  return {
    discipline: input.discipline as Discipline,
    ageCategoryId: input.ageCategoryId ?? null,
    levelClassId: input.levelClassId ?? null,
    name: localized(input.nameNl, input.nameEn) ?? Prisma.DbNull,
    feeCents: input.fee,
    maxEntries: input.maxEntries ?? null,
    drawType: input.drawType as DrawType,
    groupSize: groups ? (input.groupSize ?? null) : null,
    advancePerGroup: groups ? (input.advancePerGroup ?? null) : null,
    matchesPerEntry: hybrid ? (input.matchesPerEntry ?? null) : null,
    knockoutSize: hybrid ? (input.knockoutSize ?? null) : null,
    bestOf: input.bestOf,
    pointsToWin: input.pointsToWin,
    pointsCap: input.pointsCap,
    isOpen: input.isOpen,
  };
}

/** Same discipline + age category + level can exist only once per tournament (NULLs included). */
async function assertUnique(
  tournamentId: string,
  data: ReturnType<typeof toData>,
  exceptId?: string,
) {
  const clash = await prisma.tournamentEvent.findFirst({
    where: {
      tournamentId,
      deletedAt: null,
      discipline: data.discipline,
      ageCategoryId: data.ageCategoryId,
      levelClassId: data.levelClassId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });
  if (clash) throw new AppError('duplicateEvent');
}

export async function getEvent(actor: Actor, tournamentId: string, eventId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const event = await prisma.tournamentEvent.findFirst({
    where: { id: eventId, tournamentId, deletedAt: null },
  });
  if (!event) throw new AppError('notFound');
  return event;
}

export async function createEvent(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const data = toData(parseInput(eventSchema, input));
  await assertUnique(tournamentId, data);
  const last = await prisma.tournamentEvent.aggregate({
    where: { tournamentId },
    _max: { sortOrder: true },
  });
  const event = await prisma.tournamentEvent.create({
    data: { ...data, tournamentId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'event.create',
    entityType: 'TournamentEvent',
    entityId: event.id,
    after: {
      tournamentId,
      discipline: event.discipline,
      feeCents: event.feeCents,
      drawType: event.drawType,
    },
    meta,
  });
  return event;
}

export async function updateEvent(
  actor: Actor,
  tournamentId: string,
  eventId: string,
  input: unknown,
  meta: RequestMeta,
) {
  const before = await getEvent(actor, tournamentId, eventId);
  const data = toData(parseInput(eventSchema, input));
  await assertUnique(tournamentId, data, eventId);
  const entries = await prisma.registration.count({
    where: { eventId, status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] } },
  });
  // With entries, the category itself can't change (would invalidate eligibility).
  if (
    entries > 0 &&
    (data.discipline !== before.discipline ||
      data.ageCategoryId !== before.ageCategoryId ||
      data.levelClassId !== before.levelClassId)
  ) {
    throw new AppError('hasRegistrations');
  }
  const event = await prisma.tournamentEvent.update({ where: { id: eventId }, data });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'event.update',
    entityType: 'TournamentEvent',
    entityId: eventId,
    before: { feeCents: before.feeCents, maxEntries: before.maxEntries, drawType: before.drawType },
    after: { feeCents: event.feeCents, maxEntries: event.maxEntries, drawType: event.drawType },
    meta,
  });
  return event;
}

export async function deleteEvent(
  actor: Actor,
  tournamentId: string,
  eventId: string,
  meta: RequestMeta,
) {
  await getEvent(actor, tournamentId, eventId);
  const entries = await prisma.registration.count({ where: { eventId } });
  if (entries > 0) throw new AppError('hasRegistrations');
  await prisma.tournamentEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'event.delete',
    entityType: 'TournamentEvent',
    entityId: eventId,
    meta,
  });
}

/** Age categories and levels for the event form. */
export async function eventOptions() {
  const [ageCategories, levels] = await Promise.all([
    prisma.ageCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.levelClass.findMany({
      where: { isActive: true },
      orderBy: { rank: 'asc' },
      select: { id: true, code: true },
    }),
  ]);
  return { ageCategories, levels };
}
