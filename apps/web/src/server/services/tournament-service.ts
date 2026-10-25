/**
 * Tournaments, their status workflow and organiser delegation. Admins create tournaments;
 * delegated organisers (THIRD_PARTY) manage only the tournaments assigned to them.
 */
import { Prisma, prisma, Role, type TournamentStatus } from '@tourneasy/db';
import {
  fieldErrors,
  NEW_VENUE,
  organiserEmailSchema,
  STATUS_TRANSITIONS,
  tournamentSchema,
  tournamentStatusSchema,
  venueSchema,
  type TournamentStatusCode,
} from '@tourneasy/shared';
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { localized, uniqueSlug } from '../lib/slug';
import { pageCount, pageParams, parseInput } from '../lib/validation';
import { assertAdmin, assertCanManageTournament, assertPortalAccess, isAdmin } from './permissions';
import type { Actor } from './session-service';
import { createVenue } from './venue-service';

// ── Queries ────────────────────────────────────────────────────────────────────────

export async function listTournaments(
  actor: Actor,
  params: { q?: string; status?: TournamentStatusCode; page?: number } = {},
) {
  assertPortalAccess(actor);
  const { page, skip, take } = pageParams(params.page);
  const q = params.q?.trim();
  const where: Prisma.TournamentWhereInput = {
    deletedAt: null,
    ...(params.status ? { status: params.status } : { status: { not: 'ARCHIVED' } }),
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    // Organisers only see the tournaments delegated to them.
    ...(isAdmin(actor) ? {} : { organisers: { some: { userId: actor.userId } } }),
  };
  const [total, tournaments] = await Promise.all([
    prisma.tournament.count({ where }),
    prisma.tournament.findMany({
      where,
      orderBy: [{ startsOn: 'asc' }, { name: 'asc' }],
      skip,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        type: true,
        isPublished: true,
        startsOn: true,
        endsOn: true,
        maxParticipants: true,
        venue: { select: { name: true, city: true } },
        _count: { select: { events: { where: { deletedAt: null } } } },
      },
    }),
  ]);
  // Entries per tournament: active (confirmed or awaiting payment) and on the waiting list.
  const counts = tournaments.length
    ? await prisma.registration.findMany({
        where: {
          status: { in: ['CONFIRMED', 'PENDING', 'WAITLISTED'] },
          event: { tournamentId: { in: tournaments.map((x) => x.id) }, deletedAt: null },
        },
        select: { status: true, event: { select: { tournamentId: true } } },
      })
    : [];
  const entries = (id: string, waiting: boolean) =>
    counts.filter((c) => c.event.tournamentId === id && (c.status === 'WAITLISTED') === waiting)
      .length;
  return {
    tournaments: tournaments.map((x) => ({
      ...x,
      entries: entries(x.id, false),
      waitlisted: entries(x.id, true),
    })),
    total,
    page,
    pages: pageCount(total),
  };
}

/**
 * Tournaments the actor may manage (admins: all; organisers: theirs), current and upcoming
 * first, for the tournament switcher and the organiser's dashboard. Empty for others.
 */
export async function managedTournaments(actor: Actor, take = 100) {
  if (!actor.roles.includes('ADMIN') && !actor.roles.includes('ORGANISER')) return [];
  const rows = await prisma.tournament.findMany({
    where: {
      deletedAt: null,
      status: { not: 'ARCHIVED' },
      ...(isAdmin(actor) ? {} : { organisers: { some: { userId: actor.userId } } }),
    },
    orderBy: [{ startsOn: 'asc' }, { name: 'asc' }],
    take,
    select: { id: true, name: true, startsOn: true, endsOn: true, status: true },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const current = rows.filter((r) => r.endsOn >= today);
  const past = rows.filter((r) => r.endsOn < today).reverse();
  return [...current, ...past];
}

export async function getTournament(actor: Actor, id: string) {
  await assertCanManageTournament(actor, id);
  const tournament = await prisma.tournament.findFirst({
    where: { id, deletedAt: null },
    include: {
      venue: { select: { id: true, name: true, city: true, numberOfCourts: true } },
      organisers: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
      organiserInvites: { where: { acceptedAt: null }, orderBy: { createdAt: 'asc' } },
      events: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          ageCategory: { select: { id: true, code: true, name: true } },
          levelClass: { select: { id: true, code: true } },
          _count: {
            select: { registrations: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } } },
          },
        },
      },
    },
  });
  if (!tournament) throw new AppError('notFound');
  return tournament;
}
export type TournamentDetail = Awaited<ReturnType<typeof getTournament>>;

// ── Create / update ────────────────────────────────────────────────────────────────

function toData(input: ReturnType<typeof tournamentSchema.parse>) {
  return {
    name: input.name,
    venueId: input.venueId ?? null,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    dayStartTime: input.dayStartTime ?? null,
    dayEndTime: input.dayEndTime ?? null,
    matchMinutes: input.matchMinutes,
    singleGameMinutes: input.singleGameMinutes,
    noShowMinutes: input.noShowMinutes,
    restMinutes: input.restMinutes,
    registrationOpensAt: input.registrationOpensAt,
    registrationClosesAt: input.registrationClosesAt,
    entryDeadline: input.registrationClosesAt,
    withdrawalDeadline: input.withdrawalDeadline,
    maxParticipants: input.maxParticipants ?? null,
    maxEventsPerPlayer: input.maxEventsPerPlayer,
    courtsAvailable: input.courtsAvailable ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    description: localized(input.descriptionNl, input.descriptionEn) ?? Prisma.DbNull,
    partnerPaymentMode: input.partnerPaymentMode,
    refundPolicy: input.refundPolicy,
    refundPercent: input.refundPercent,
    bundlePricesCents: input.bundlePricesCents,
  };
}

/**
 * "Add new venue" in the tournament form: validates the tournament and the inline venue
 * (`newVenue.*` fields) together so all errors show at once, creates the venue, and returns
 * the input with its id. Only admins manage venues.
 */
async function resolveNewVenue(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
  creating = false,
): Promise<unknown> {
  if (typeof input !== 'object' || input === null) return input;
  const record = input as Record<string, unknown>;
  if (record.venueId !== NEW_VENUE) return input;
  assertAdmin(actor);
  const venueInput = (record.newVenue ?? {}) as Record<string, unknown>;
  const tournament = tournamentSchema.safeParse({ ...record, venueId: undefined });
  const venue = venueSchema.safeParse(venueInput);
  const errors: Record<string, string> = tournament.success ? {} : fieldErrors(tournament.error);
  if (creating && record.type === 'THIRD_PARTY' && !record.organiserEmail)
    errors.organiserEmail ??= 'organiserEmailRequired';
  if (!venue.success)
    for (const [field, error] of Object.entries(fieldErrors(venue.error)))
      errors[`newVenue.${field}`] = error;
  if (Object.keys(errors).length > 0) throw validationError(errors);
  const created = await createVenue(actor, venueInput, meta);
  return { ...record, venueId: created.id };
}

export async function createTournament(actor: Actor, input: unknown, meta: RequestMeta) {
  assertAdmin(actor); // "Create tournaments" is visible only to the site's admins.
  const data = parseInput(tournamentSchema, await resolveNewVenue(actor, input, meta, true));
  if (data.type === 'THIRD_PARTY' && !data.organiserEmail) {
    throw validationError({ organiserEmail: 'organiserEmailRequired' });
  }
  const year = data.startsOn.getUTCFullYear();
  const slug = await uniqueSlug(
    `${data.name} ${year}`,
    async (s) => !!(await prisma.tournament.findUnique({ where: { slug: s } })),
  );

  const tournament = await prisma.tournament.create({
    data: { ...toData(data), slug, type: data.type, createdById: actor.userId },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'tournament.create',
    entityType: 'Tournament',
    entityId: tournament.id,
    after: { name: tournament.name, type: tournament.type },
    meta,
  });
  if (data.type === 'THIRD_PARTY' && data.organiserEmail) {
    await addOrganiser(actor, tournament.id, { email: data.organiserEmail }, meta);
  }
  return tournament;
}

export async function updateTournament(
  actor: Actor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, id);
  const data = parseInput(tournamentSchema, await resolveNewVenue(actor, input, meta));
  const before = await prisma.tournament.findFirstOrThrow({ where: { id, deletedAt: null } });
  const tournament = await prisma.tournament.update({
    where: { id },
    // Only admins change the tournament type; organisers manage the details.
    data: { ...toData(data), ...(isAdmin(actor) ? { type: data.type } : {}) },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'tournament.update',
    entityType: 'Tournament',
    entityId: id,
    before: {
      name: before.name,
      startsOn: before.startsOn.toISOString(),
      endsOn: before.endsOn.toISOString(),
    },
    after: {
      name: tournament.name,
      startsOn: tournament.startsOn.toISOString(),
      endsOn: tournament.endsOn.toISOString(),
    },
    meta,
  });
  return tournament;
}

export async function changeTournamentStatus(
  actor: Actor,
  id: string,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, id);
  const { status } = parseInput(tournamentStatusSchema, input);
  const tournament = await prisma.tournament.findFirstOrThrow({
    where: { id, deletedAt: null },
    include: { _count: { select: { events: { where: { deletedAt: null, isOpen: true } } } } },
  });
  const from = tournament.status as TournamentStatusCode;
  if (!STATUS_TRANSITIONS[from].includes(status)) throw new AppError('statusTransition');
  // Opening entries needs at least one open event.
  if (status === 'OPEN' && tournament._count.events === 0) throw new AppError('noOpenEvents');

  await prisma.tournament.update({ where: { id }, data: { status: status as TournamentStatus } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'tournament.status',
    entityType: 'Tournament',
    entityId: id,
    before: { status: from },
    after: { status },
    meta,
  });
}

export async function setTournamentPublished(
  actor: Actor,
  id: string,
  published: boolean,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, id);
  await prisma.tournament.update({ where: { id }, data: { isPublished: published } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: published ? 'tournament.publish' : 'tournament.unpublish',
    entityType: 'Tournament',
    entityId: id,
    meta,
  });
}

// ── Organiser delegation ───────────────────────────────────────────────────────────

async function linkOrganiser(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  userId: string,
  grantedById: string | null,
) {
  await tx.tournamentOrganiser.upsert({
    where: { tournamentId_userId: { tournamentId, userId } },
    create: { tournamentId, userId },
    update: {},
  });
  await tx.userRole.createMany({
    data: [{ userId, role: Role.ORGANISER, grantedById }],
    skipDuplicates: true,
  });
}

/** Admin assigns an organiser by email: linked now if the account exists, else invited. */
export async function addOrganiser(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
) {
  assertAdmin(actor);
  const { email } = parseInput(organiserEmailSchema, input);
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, deletedAt: null },
  });
  if (!tournament) throw new AppError('notFound');

  const user = await prisma.user.findFirst({
    where: { email, isActive: true, anonymisedAt: null },
  });
  if (user) {
    await prisma.$transaction(async (tx) => {
      await linkOrganiser(tx, tournamentId, user.id, actor.userId);
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'tournament.organiser.add',
        entityType: 'Tournament',
        entityId: tournamentId,
        after: { userId: user.id, email },
        meta,
      });
    });
    const locale = user.locale as AppLocale;
    await sendMailSafely(
      await renderEmail(user.email, locale, {
        kind: 'roleChanged',
        name: user.name,
        role: `${messages[locale].Roles.ORGANISER} – ${tournament.name}`,
        granted: true,
      }),
    );
    return { linked: true };
  }

  await prisma.organiserInvite.upsert({
    where: { tournamentId_email: { tournamentId, email } },
    create: { tournamentId, email, invitedById: actor.userId },
    update: {},
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'tournament.organiser.invite',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { email },
    meta,
  });
  return { linked: false };
}

export async function removeOrganiser(
  actor: Actor,
  tournamentId: string,
  target: { userId?: string; inviteId?: string },
  meta: RequestMeta,
) {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    if (target.inviteId) {
      await tx.organiserInvite.deleteMany({ where: { id: target.inviteId, tournamentId } });
    }
    if (target.userId) {
      await tx.tournamentOrganiser.deleteMany({ where: { tournamentId, userId: target.userId } });
      // No tournaments left to organise → drop the ORGANISER role.
      const remaining = await tx.tournamentOrganiser.count({ where: { userId: target.userId } });
      if (remaining === 0)
        await tx.userRole.deleteMany({ where: { userId: target.userId, role: Role.ORGANISER } });
    }
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'tournament.organiser.remove',
      entityType: 'Tournament',
      entityId: tournamentId,
      before: target,
      meta,
    });
  });
}

/** Called after sign-up/login: turns pending invites for this email into organiser rights. */
export async function acceptOrganiserInvites(userId: string, email: string): Promise<number> {
  const invites = await prisma.organiserInvite.findMany({
    where: { email, acceptedAt: null, tournament: { deletedAt: null } },
  });
  if (invites.length === 0) return 0;
  await prisma.$transaction(async (tx) => {
    for (const invite of invites) {
      await linkOrganiser(tx, invite.tournamentId, userId, invite.invitedById);
      await tx.organiserInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      await writeAudit(tx, {
        actorId: userId,
        action: 'tournament.organiser.accept',
        entityType: 'Tournament',
        entityId: invite.tournamentId,
        after: { email },
      });
    }
  });
  return invites.length;
}
