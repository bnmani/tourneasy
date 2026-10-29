/**
 * Entering tournaments (Phase 4, D48): eligibility, partners and invites, capacity with a
 * waiting list, withdrawals and the organiser's entry list. With online payment on (Phase 5,
 * D51) a paid entry is PENDING and holds its place for 30 minutes until the entrant pays; free
 * events are confirmed with the shares WAIVED. Without payments entries are confirmed straight
 * away with the shares UNPAID (paid at the desk).
 */
import { Prisma, prisma, type Discipline, type RegistrationStatus } from '@tourneasy/db';
import {
  ENTRY_TERMS_VERSION,
  entrySchema,
  isDoubles,
  isMinor,
  pairEligibility,
  playerEligibility,
  tournamentPhase,
  withdrawSchema,
  type EligibilityReason,
  type EligiblePlayer,
} from '@tourneasy/shared';
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { hashToken, randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { enforce, LIMITS } from '../lib/rate-limit';
import { parseInput } from '../lib/validation';
import { amountsDue, HOLD_MINUTES, paymentsEnabled, PROMOTION_HOURS } from '../payments/pricing';
import { refundsForCancelledRegistration } from './refund-service';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';
import { emailLogo } from './logo-service';

export const ACTIVE: RegistrationStatus[] = ['PENDING', 'CONFIRMED'];
const LIVE: RegistrationStatus[] = ['PENDING', 'CONFIRMED', 'WAITLISTED'];
const INVITE_DAYS = 7;

// ── Loading helpers ────────────────────────────────────────────────────────────────

export const playerSelect = {
  id: true,
  userId: true,
  memberNumber: true,
  firstName: true,
  lastNamePrefix: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  phone: true,
  contactEmail: true,
  levelSingles: { select: { rank: true } },
  levelDoubles: { select: { rank: true } },
  levelMixed: { select: { rank: true } },
  user: { select: { email: true, name: true, locale: true } },
} satisfies Prisma.PlayerProfileSelect;
export type PlayerRow = Prisma.PlayerProfileGetPayload<{ select: typeof playerSelect }>;

export const fullName = (p: {
  firstName: string;
  lastNamePrefix: string | null;
  lastName: string;
}) => [p.firstName, p.lastNamePrefix, p.lastName].filter(Boolean).join(' ');

/**
 * The name on public pages (D83): under-16s show as first name and initial ("Anna V."), so
 * draws, schedules and results don't publish a child's full name. Portal pages use fullName.
 */
export const publicName = (p: {
  firstName: string;
  lastNamePrefix: string | null;
  lastName: string;
  dateOfBirth?: Date | null;
}) =>
  p.dateOfBirth && isMinor(p.dateOfBirth)
    ? `${p.firstName} ${p.lastName.charAt(0).toUpperCase()}.`
    : fullName(p);

function asEligible(p: PlayerRow): EligiblePlayer {
  return {
    gender: p.gender,
    dateOfBirth: p.dateOfBirth,
    levelRank: {
      singles: p.levelSingles?.rank ?? null,
      doubles: p.levelDoubles?.rank ?? null,
      mixed: p.levelMixed?.rank ?? null,
    },
  };
}

async function myPlayer(actor: Actor): Promise<PlayerRow> {
  const p = await prisma.playerProfile.findFirst({
    where: { userId: actor.userId, deletedAt: null },
    select: playerSelect,
  });
  if (!p) throw new AppError('noPlayerProfile');
  return p;
}

export const eventSelect = {
  id: true,
  discipline: true,
  name: true,
  feeCents: true,
  maxEntries: true,
  isOpen: true,
  deletedAt: true,
  sortOrder: true,
  ageCategory: {
    select: {
      code: true,
      name: true,
      minAge: true,
      maxAge: true,
      referenceMonth: true,
      referenceDay: true,
      sortOrder: true,
    },
  },
  levelClass: { select: { code: true, rank: true } },
} satisfies Prisma.TournamentEventSelect;
export type EventRow = Prisma.TournamentEventGetPayload<{ select: typeof eventSelect }>;

export function eligibility(
  player: PlayerRow,
  event: EventRow,
  startsOn: Date,
): EligibilityReason[] {
  return playerEligibility(
    asEligible(player),
    {
      discipline: event.discipline,
      ageCategory: event.ageCategory,
      levelRank: event.levelClass?.rank ?? null,
    },
    startsOn,
  );
}

async function loadTournament(slug: string) {
  const t = await prisma.tournament.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      startsOn: true,
      endsOn: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      withdrawalDeadline: true,
      maxEventsPerPlayer: true,
      maxParticipants: true,
      bundlePricesCents: true,
      partnerPaymentMode: true,
      events: { where: { deletedAt: null }, select: eventSelect },
    },
  });
  if (!t) throw new AppError('notFound');
  return t;
}

/** Entries (singles players or pairs) that hold a place in each event. */
export async function activeCounts(eventIds: string[], db: Prisma.TransactionClient = prisma) {
  const rows = await db.registration.groupBy({
    by: ['eventId'],
    where: { eventId: { in: eventIds }, status: { in: ACTIVE } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.eventId, r._count._all]));
}

/** Events the player is already in (any live status) and how many count towards the cap. */
export async function playerEntries(playerId: string, tournamentId: string) {
  const rows = await prisma.registrationParticipant.findMany({
    where: {
      playerId,
      active: true,
      registration: { status: { in: LIVE }, event: { tournamentId, deletedAt: null } },
    },
    select: { eventId: true },
  });
  return new Set(rows.map((r) => r.eventId));
}

// ── Entry form ─────────────────────────────────────────────────────────────────────

export async function getEntryOptions(actor: Actor, slug: string, now = new Date()) {
  await expireStaleHolds(now);
  const [t, player] = await Promise.all([loadTournament(slug), myPlayer(actor)]);
  const [counts, entered] = await Promise.all([
    activeCounts(t.events.map((e) => e.id)),
    playerEntries(player.id, t.id),
  ]);
  const events = t.events
    .slice()
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        (a.ageCategory?.sortOrder ?? -1) - (b.ageCategory?.sortOrder ?? -1) ||
        (a.levelClass?.rank ?? 0) - (b.levelClass?.rank ?? 0) ||
        a.discipline.localeCompare(b.discipline),
    )
    .map((e) => {
      const taken = counts.get(e.id) ?? 0;
      return {
        id: e.id,
        discipline: e.discipline,
        name: e.name,
        ageCategory: e.ageCategory ? { code: e.ageCategory.code, name: e.ageCategory.name } : null,
        level: e.levelClass?.code ?? null,
        feeCents: e.feeCents,
        doubles: isDoubles(e.discipline),
        isOpen: e.isOpen,
        maxEntries: e.maxEntries,
        taken,
        full: e.maxEntries !== null && taken >= e.maxEntries,
        alreadyEntered: entered.has(e.id),
        reasons: eligibility(player, e, t.startsOn),
      };
    });
  return {
    tournament: {
      id: t.id,
      slug: t.slug,
      name: t.name,
      startsOn: t.startsOn,
      endsOn: t.endsOn,
      phase: tournamentPhase(t, now),
      registrationClosesAt: t.registrationClosesAt,
      withdrawalDeadline: t.withdrawalDeadline,
      maxEventsPerPlayer: t.maxEventsPerPlayer,
      bundlePricesCents: t.bundlePricesCents,
      partnerPaysAll: t.partnerPaymentMode === 'INITIATOR_PAYS_ALL',
      payOnline: await paymentsEnabled(),
    },
    player: {
      name: fullName(player),
      memberNumber: player.memberNumber,
      email: player.user?.email ?? player.contactEmail ?? '',
      phone: player.phone ?? '',
      gender: player.gender,
      dateOfBirth: player.dateOfBirth,
    },
    enteredCount: entered.size,
    events,
  };
}

/** Partner by member number or email; email of someone without an account → invite by email. */
async function resolvePartner(identifier: string) {
  const id = identifier.trim();
  if (/^TE\d{6}$/i.test(id)) {
    const p = await prisma.playerProfile.findFirst({
      where: { memberNumber: id.toUpperCase(), deletedAt: null, mergedIntoId: null },
      select: playerSelect,
    });
    if (!p) return null;
    return { player: p, email: null };
  }
  const email = id.toLowerCase();
  const p = await prisma.playerProfile.findFirst({
    where: {
      deletedAt: null,
      mergedIntoId: null,
      OR: [{ user: { email } }, { contactEmail: email }],
    },
    select: playerSelect,
  });
  return p ? { player: p, email: null } : { player: null, email };
}

type PlannedEntry = {
  event: EventRow;
  partner: PlayerRow | null;
  partnerEmail: string | null;
  lookingForPartner: boolean;
};

export async function enterTournament(
  actor: Actor,
  slug: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  if (!actor.emailVerified) throw new AppError('emailNotVerified');
  const data = parseInput(entrySchema, input);
  await expireStaleHolds(now);
  const [t, player] = await Promise.all([loadTournament(slug), myPlayer(actor)]);
  if (tournamentPhase(t, now) !== 'registrationOpen') throw new AppError('registrationClosed');

  const entered = await playerEntries(player.id, t.id);
  const seen = new Set<string>();
  const errors: Record<string, string> = {};
  const planned: PlannedEntry[] = [];

  for (const choice of data.events) {
    if (seen.has(choice.eventId)) continue;
    seen.add(choice.eventId);
    const key = `event.${choice.eventId}`;
    const event = t.events.find((e) => e.id === choice.eventId);
    if (!event || !event.isOpen) {
      errors[key] = 'registrationClosed';
      continue;
    }
    if (entered.has(event.id)) {
      errors[key] = 'alreadyEntered';
      continue;
    }
    if (eligibility(player, event, t.startsOn).length > 0) {
      errors[key] = 'notEligible';
      continue;
    }
    if (!isDoubles(event.discipline)) {
      planned.push({ event, partner: null, partnerEmail: null, lookingForPartner: false });
      continue;
    }
    if (!choice.partner) {
      if (choice.lookingForPartner) {
        planned.push({ event, partner: null, partnerEmail: null, lookingForPartner: true });
      } else errors[`partner.${event.id}`] = 'partnerRequired';
      continue;
    }
    const resolved = await resolvePartner(choice.partner);
    if (!resolved) {
      errors[`partner.${event.id}`] = 'partnerNotFound';
      continue;
    }
    if (resolved.player) {
      const partner = resolved.player;
      if (partner.id === player.id) {
        errors[`partner.${event.id}`] = 'partnerSelf';
        continue;
      }
      const reasons = [
        ...eligibility(partner, event, t.startsOn),
        ...pairEligibility(event.discipline, player, partner),
      ];
      if (reasons.length > 0) {
        errors[`partner.${event.id}`] = 'partnerIneligible';
        continue;
      }
      if ((await playerEntries(partner.id, t.id)).has(event.id)) {
        errors[`partner.${event.id}`] = 'partnerAlreadyEntered';
        continue;
      }
    } else if (resolved.email === (player.user?.email ?? '').toLowerCase()) {
      errors[`partner.${event.id}`] = 'partnerSelf';
      continue;
    }
    planned.push({
      event,
      partner: resolved.player,
      partnerEmail: resolved.email,
      lookingForPartner: false,
    });
  }

  if (entered.size + planned.length > t.maxEventsPerPlayer) errors.events = 'maxEvents';
  if (Object.keys(errors).length > 0) throw validationError(errors);
  for (const p of planned) if (p.partnerEmail) await limitInviteEmail(actor.userId, p.partnerEmail);

  if (data.phone && data.phone !== player.phone) {
    await prisma.playerProfile.update({ where: { id: player.id }, data: { phone: data.phone } });
  }

  const inviteExpiry = new Date(
    Math.min(now.getTime() + INVITE_DAYS * 86_400_000, t.registrationClosesAt.getTime()),
  );
  const invites: {
    email: string;
    name: string;
    locale: AppLocale;
    token: string;
    eventId: string;
  }[] = [];

  const online = await paymentsEnabled();
  const holdUntil = new Date(now.getTime() + HOLD_MINUTES * 60_000);
  let created: {
    id: string;
    eventId: string;
    status: RegistrationStatus;
    waitlistPosition: number | null;
  }[];
  try {
    created = await prisma.$transaction(
      async (tx) => {
        // Lock the event rows (sorted, to avoid deadlocks) so two people can't take the last place.
        const ids = planned.map((p) => p.event.id).sort();
        await tx.$queryRaw`SELECT id FROM "TournamentEvent" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
        const counts = await activeCounts(ids, tx);
        const playersInTournament = t.maxParticipants
          ? await tx.registrationParticipant.count({
              where: {
                active: true,
                registration: { status: { in: ACTIVE }, event: { tournamentId: t.id } },
              },
            })
          : 0;
        let added = 0;
        const out = [];
        for (const plan of planned) {
          const taken = counts.get(plan.event.id) ?? 0;
          const eventFull = plan.event.maxEntries !== null && taken >= plan.event.maxEntries;
          const tournamentFull =
            t.maxParticipants !== null && playersInTournament + added >= t.maxParticipants;
          let status: RegistrationStatus = 'CONFIRMED';
          let waitlistPosition: number | null = null;
          if (eventFull || tournamentFull) {
            status = 'WAITLISTED';
            const last = await tx.registration.aggregate({
              where: { eventId: plan.event.id, status: 'WAITLISTED' },
              _max: { waitlistPosition: true },
            });
            waitlistPosition = (last._max.waitlistPosition ?? 0) + 1;
          } else {
            added += 1;
            // Paid online: the place is held until the entrant pays (D51).
            if (online && plan.event.feeCents > 0) status = 'PENDING';
          }
          const registration = await tx.registration.create({
            data: {
              eventId: plan.event.id,
              status,
              waitlistPosition,
              holdExpiresAt: status === 'PENDING' ? holdUntil : null,
              createdById: actor.userId,
              confirmedAt: status === 'CONFIRMED' ? now : null,
              termsVersion: ENTRY_TERMS_VERSION,
              termsAcceptedAt: now,
              participants: {
                create: {
                  eventId: plan.event.id,
                  playerId: player.id,
                  role: 'PRIMARY',
                  checkInToken: randomToken(18),
                  paymentStatus: plan.event.feeCents === 0 ? 'WAIVED' : 'UNPAID',
                },
              },
            },
          });
          if (plan.partner || plan.partnerEmail) {
            const token = randomToken();
            await tx.partnerInvite.create({
              data: {
                registrationId: registration.id,
                fromPlayerId: player.id,
                toPlayerId: plan.partner?.id ?? null,
                toEmail: plan.partner ? null : plan.partnerEmail,
                tokenHash: hashToken(token),
                expiresAt: inviteExpiry,
              },
            });
            const email =
              plan.partner?.user?.email ?? plan.partner?.contactEmail ?? plan.partnerEmail;
            if (email) {
              invites.push({
                email,
                name: plan.partner ? plan.partner.firstName : '',
                locale: (plan.partner?.user?.locale as AppLocale | undefined) ?? actor.locale,
                token,
                eventId: plan.event.id,
              });
            }
          }
          if (plan.lookingForPartner) {
            await tx.partnerRequest.upsert({
              where: { eventId_playerId: { eventId: plan.event.id, playerId: player.id } },
              create: { eventId: plan.event.id, playerId: player.id },
              update: { closedAt: null },
            });
          }
          await writeAudit(tx, {
            actorId: actor.userId,
            action: 'registration.create',
            entityType: 'Registration',
            entityId: registration.id,
            after: { eventId: plan.event.id, status, waitlistPosition },
            meta,
          });
          out.push({ id: registration.id, eventId: plan.event.id, status, waitlistPosition });
        }
        return out;
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    // The partial unique index catches a double submit or a race with a partner's entry.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('validation', { fields: { events: 'alreadyEntered' } });
    }
    throw error;
  }

  const locale = actor.locale;
  const logo = await emailLogo(t.id, t.name);
  const label = (eventId: string, l: AppLocale) =>
    eventText(planned.find((p) => p.event.id === eventId)!.event, l);
  await sendMailSafely(
    await renderEmail(player.user?.email ?? '', locale, {
      kind: 'entryConfirmed',
      logo,
      name: player.firstName,
      tournament: t.name,
      lines: created.map((c) =>
        c.status === 'WAITLISTED'
          ? messages[locale].Email.entryLineWaitlist
              .replace('{event}', label(c.eventId, locale))
              .replace('{position}', String(c.waitlistPosition))
          : messages[locale].Email.entryLine.replace('{event}', label(c.eventId, locale)),
      ),
      url: appUrl(locale, '/account?tab=upcoming'),
      payWithinMinutes: created.some((c) => c.status === 'PENDING') ? HOLD_MINUTES : undefined,
    }),
  );
  for (const invite of invites) {
    await sendMailSafely(
      await renderEmail(invite.email, invite.locale, {
        kind: 'partnerInvite',
        logo,
        name: invite.name,
        from: fullName(player),
        tournament: t.name,
        event: label(invite.eventId, invite.locale),
        url: appUrl(invite.locale, `/invites/${invite.token}`),
      }),
    );
  }
  // The participant ids let the client open the payment window straight away.
  const mine = await prisma.registrationParticipant.findMany({
    where: { registrationId: { in: created.map((c) => c.id) }, playerId: player.id },
    select: { id: true, registrationId: true, paymentStatus: true },
  });
  return {
    registrations: created.map((c) => {
      const p = mine.find((m) => m.registrationId === c.id);
      return { ...c, participantId: p?.id ?? null, paymentStatus: p?.paymentStatus ?? 'UNPAID' };
    }),
    holdExpiresAt: created.some((c) => c.status === 'PENDING') ? holdUntil : null,
  };
}

/** "Herendubbel · Senioren · B" in the given language. */
export function eventText(
  e: {
    discipline: Discipline;
    name: Prisma.JsonValue | null;
    ageCategory: { code: string; name: Prisma.JsonValue } | null;
    levelClass?: { code: string } | null;
  },
  locale: AppLocale,
): string {
  const pick = (v: Prisma.JsonValue | null) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return '';
    const o = v as { nl?: string; en?: string };
    return (locale === 'en' && o.en) || o.nl || o.en || '';
  };
  const custom = pick(e.name);
  if (custom) return custom;
  return [
    messages[locale].Disciplines[e.discipline],
    e.ageCategory ? pick(e.ageCategory.name) || e.ageCategory.code : null,
    e.levelClass?.code,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── My entries ─────────────────────────────────────────────────────────────────────

const registrationSelect = {
  id: true,
  status: true,
  waitlistPosition: true,
  holdExpiresAt: true,
  createdAt: true,
  event: {
    select: {
      id: true,
      discipline: true,
      name: true,
      feeCents: true,
      ageCategory: { select: { code: true, name: true } },
      levelClass: { select: { code: true } },
      tournament: {
        select: {
          id: true,
          slug: true,
          name: true,
          startsOn: true,
          endsOn: true,
          withdrawalDeadline: true,
          isPublished: true,
          schedulePublishedAt: true,
        },
      },
      // Whether this category's draw is out (for the dashboard's schedule line).
      draws: { where: { status: { not: 'DRAFT' } }, select: { id: true }, take: 1 },
    },
  },
  participants: {
    where: { active: true },
    select: {
      id: true,
      role: true,
      paymentStatus: true,
      player: {
        select: {
          id: true,
          memberNumber: true,
          firstName: true,
          lastNamePrefix: true,
          lastName: true,
        },
      },
    },
  },
  invites: {
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      toEmail: true,
      expiresAt: true,
      toPlayer: { select: { firstName: true, lastNamePrefix: true, lastName: true } },
    },
  },
} satisfies Prisma.RegistrationSelect;

export async function listMyRegistrations(actor: Actor, now = new Date()) {
  const player = await myPlayer(actor);
  const rows = await prisma.registration.findMany({
    where: {
      participants: { some: { playerId: player.id, active: true } },
      status: { in: LIVE },
    },
    orderBy: [{ event: { tournament: { startsOn: 'asc' } } }, { createdAt: 'asc' }],
    select: registrationSelect,
  });
  const lookingFor = new Set(
    (
      await prisma.partnerRequest.findMany({
        where: { playerId: player.id, closedAt: null },
        select: { eventId: true },
      })
    ).map((r) => r.eventId),
  );
  // What I still owe per share, per tournament (multi-category discount, D52).
  const due = new Map<string, number>();
  for (const tournamentId of new Set(rows.map((r) => r.event.tournament.id))) {
    for (const [id, cents] of await amountsDue(player.id, tournamentId)) due.set(id, cents);
  }
  const online = await paymentsEnabled();
  return rows.map((r) => {
    const me = r.participants.find((p) => p.player.id === player.id)!;
    const amountDue = due.get(me.id) ?? null;
    const partner = r.participants.find((p) => p.player.id !== player.id);
    const invite = r.invites[0] && r.invites[0].expiresAt > now ? r.invites[0] : null;
    const t = r.event.tournament;
    return {
      id: r.id,
      status: r.status,
      waitlistPosition: r.waitlistPosition,
      tournament: {
        slug: t.slug,
        name: t.name,
        startsOn: t.startsOn,
        endsOn: t.endsOn,
        schedulePublished: t.isPublished && !!t.schedulePublishedAt,
      },
      event: { ...r.event, tournament: undefined, draws: undefined },
      drawPublished: r.event.draws.length > 0,
      doubles: isDoubles(r.event.discipline),
      myRole: me.role,
      participantId: me.id,
      paymentStatus: me.paymentStatus,
      amountDueCents: amountDue,
      holdExpiresAt: r.status === 'PENDING' ? r.holdExpiresAt : null,
      canPay: online && amountDue !== null && (r.status === 'PENDING' || r.status === 'CONFIRMED'),
      partner: partner
        ? { name: fullName(partner.player), memberNumber: partner.player.memberNumber }
        : null,
      pendingInvite: invite
        ? { to: invite.toPlayer ? fullName(invite.toPlayer) : (invite.toEmail ?? '') }
        : null,
      lookingForPartner: lookingFor.has(r.event.id) && !partner,
      past: t.endsOn < new Date(now.toISOString().slice(0, 10)),
      canWithdraw: now < t.withdrawalDeadline,
      withdrawalDeadline: t.withdrawalDeadline,
    };
  });
}

/** Invite a (new) partner for one of my doubles entries that has none. */
/**
 * Each partner invite emails an address the player typed: at most 20 a day per player and
 * 3 a day to the same address, so invites can't be used to spam people.
 */
async function limitInviteEmail(userId: string, email: string | null | undefined) {
  await enforce(`invite:user:${userId}`, LIMITS.partnerInvitePerUser);
  if (email) await enforce(`invite:to:${email.toLowerCase()}`, LIMITS.partnerInvitePerAddress);
}

export async function invitePartner(
  actor: Actor,
  registrationId: string,
  partnerIdentifier: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const player = await myPlayer(actor);
  const r = await prisma.registration.findFirst({
    where: {
      id: registrationId,
      status: { in: LIVE },
      participants: { some: { playerId: player.id, active: true, role: 'PRIMARY' } },
    },
    select: {
      id: true,
      participants: { where: { active: true }, select: { playerId: true } },
      event: {
        select: {
          ...eventSelect,
          tournament: {
            select: {
              id: true,
              name: true,
              startsOn: true,
              registrationClosesAt: true,
              status: true,
              endsOn: true,
              registrationOpensAt: true,
            },
          },
        },
      },
    },
  });
  if (!r) throw new AppError('notFound');
  if (r.participants.length > 1) throw new AppError('forbidden');
  const t = r.event.tournament;
  if (tournamentPhase(t, now) !== 'registrationOpen') throw new AppError('registrationClosed');
  if (typeof partnerIdentifier !== 'string' || !partnerIdentifier.trim())
    throw validationError({ partner: 'partnerRequired' });
  const resolved = await resolvePartner(partnerIdentifier);
  if (!resolved) throw validationError({ partner: 'partnerNotFound' });
  if (resolved.player) {
    if (resolved.player.id === player.id) throw validationError({ partner: 'partnerSelf' });
    const reasons = [
      ...eligibility(resolved.player, r.event, t.startsOn),
      ...pairEligibility(r.event.discipline, player, resolved.player),
    ];
    if (reasons.length > 0) throw validationError({ partner: 'partnerIneligible' });
    if ((await playerEntries(resolved.player.id, t.id)).has(r.event.id))
      throw validationError({ partner: 'partnerAlreadyEntered' });
  }
  await limitInviteEmail(actor.userId, resolved.email);
  const token = randomToken();
  await prisma.$transaction(async (tx) => {
    await tx.partnerInvite.updateMany({
      where: { registrationId: r.id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: now },
    });
    await tx.partnerInvite.create({
      data: {
        registrationId: r.id,
        fromPlayerId: player.id,
        toPlayerId: resolved.player?.id ?? null,
        toEmail: resolved.player ? null : resolved.email,
        tokenHash: hashToken(token),
        expiresAt: new Date(
          Math.min(now.getTime() + INVITE_DAYS * 86_400_000, t.registrationClosesAt.getTime()),
        ),
      },
    });
    await tx.partnerRequest.updateMany({
      where: { eventId: r.event.id, playerId: player.id },
      data: { closedAt: now },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'registration.invitePartner',
      entityType: 'Registration',
      entityId: r.id,
      meta,
    });
  });
  const email = resolved.player?.user?.email ?? resolved.player?.contactEmail ?? resolved.email;
  if (email) {
    const locale = (resolved.player?.user?.locale as AppLocale | undefined) ?? actor.locale;
    await sendMailSafely(
      await renderEmail(email, locale, {
        kind: 'partnerInvite',
        name: resolved.player?.firstName ?? '',
        from: fullName(player),
        tournament: t.name,
        event: eventText(r.event, locale),
        url: appUrl(locale, `/invites/${token}`),
      }),
    );
  }
}

// ── Invites ────────────────────────────────────────────────────────────────────────

/** An invite is addressed by the token from the email link, or by id from the dashboard. */
export type InviteRef = { token: string } | { id: string };

async function findInvite(ref: InviteRef) {
  return prisma.partnerInvite.findUnique({
    where: 'token' in ref ? { tokenHash: hashToken(ref.token) } : { id: ref.id },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      toEmail: true,
      toPlayerId: true,
      fromPlayer: { select: { ...playerSelect } },
      registration: {
        select: {
          id: true,
          status: true,
          participants: { where: { active: true }, select: { playerId: true } },
          event: {
            select: {
              ...eventSelect,
              tournament: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  startsOn: true,
                  endsOn: true,
                  status: true,
                  registrationOpensAt: true,
                  registrationClosesAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

/** Invite details for the invite page; `forMe` says whether the signed-in player may answer. */
export async function getInvite(ref: InviteRef, actor: Actor | null, now = new Date()) {
  const invite = await findInvite(ref);
  if (!invite) throw new AppError('inviteInvalid');
  const r = invite.registration;
  const valid =
    invite.status === 'PENDING' &&
    invite.expiresAt > now &&
    LIVE.includes(r.status) &&
    r.participants.length === 1;
  let forMe = false;
  if (actor) {
    const me = await prisma.playerProfile.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: { id: true, user: { select: { email: true } } },
    });
    forMe =
      !!me &&
      (invite.toPlayerId === me.id ||
        (!!invite.toEmail && invite.toEmail.toLowerCase() === me.user?.email.toLowerCase()));
  }
  return {
    status: valid
      ? ('PENDING' as const)
      : invite.status === 'PENDING'
        ? ('EXPIRED' as const)
        : invite.status,
    from: fullName(invite.fromPlayer),
    tournament: r.event.tournament,
    event: r.event,
    forMe,
  };
}

export async function respondToInvite(
  actor: Actor,
  ref: InviteRef,
  accept: boolean,
  meta: RequestMeta,
  now = new Date(),
) {
  const invite = await findInvite(ref);
  if (!invite) throw new AppError('inviteInvalid');
  const details = await getInvite(ref, actor, now);
  if (details.status !== 'PENDING') throw new AppError('inviteInvalid');
  if (!details.forMe) throw new AppError('forbidden');
  const me = await myPlayer(actor);
  const r = invite.registration;
  const t = r.event.tournament;

  if (accept) {
    if (!actor.emailVerified) throw new AppError('emailNotVerified');
    const reasons = [
      ...eligibility(me, r.event, t.startsOn),
      ...pairEligibility(r.event.discipline, invite.fromPlayer, me),
    ];
    if (reasons.length > 0) throw validationError({ invite: 'notEligible' });
    const mine = await playerEntries(me.id, t.id);
    if (mine.has(r.event.id)) throw validationError({ invite: 'alreadyEntered' });
    const max = (
      await prisma.tournament.findUniqueOrThrow({
        where: { id: t.id },
        select: { maxEventsPerPlayer: true },
      })
    ).maxEventsPerPlayer;
    if (mine.size + 1 > max) throw validationError({ invite: 'maxEvents' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.partnerInvite.update({
        where: { id: invite.id },
        data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now, toPlayerId: me.id },
      });
      if (accept) {
        const settings = await tx.tournament.findUniqueOrThrow({
          where: { id: t.id },
          select: { partnerPaymentMode: true },
        });
        const fee = await tx.tournamentEvent.findUniqueOrThrow({
          where: { id: r.event.id },
          select: { feeCents: true },
        });
        await tx.registrationParticipant.create({
          data: {
            registrationId: r.id,
            eventId: r.event.id,
            playerId: me.id,
            role: 'PARTNER',
            checkInToken: randomToken(18),
            // Free event, or the entrant pays for both (D51).
            paymentStatus:
              fee.feeCents === 0
                ? 'WAIVED'
                : settings.partnerPaymentMode === 'INITIATOR_PAYS_ALL'
                  ? 'PAID_BY_PARTNER'
                  : 'UNPAID',
          },
        });
        await tx.partnerRequest.updateMany({
          where: { eventId: r.event.id, playerId: { in: [me.id, invite.fromPlayer.id] } },
          data: { closedAt: now },
        });
      }
      await writeAudit(tx, {
        actorId: actor.userId,
        action: accept ? 'registration.partnerAccepted' : 'registration.partnerDeclined',
        entityType: 'Registration',
        entityId: r.id,
        meta,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw validationError({ invite: 'alreadyEntered' });
    }
    throw error;
  }

  const inviter = invite.fromPlayer;
  const locale = (inviter.user?.locale as AppLocale | undefined) ?? 'nl';
  if (inviter.user?.email) {
    await sendMailSafely(
      await renderEmail(inviter.user.email, locale, {
        kind: accept ? 'inviteAccepted' : 'inviteDeclined',
        name: inviter.firstName,
        partner: fullName(me),
        tournament: t.name,
        event: eventText(r.event, locale),
        url: appUrl(locale, '/account?tab=upcoming'),
      }),
    );
  }
  return { tournamentSlug: t.slug };
}

/** Pending invites addressed to me (by player or by my account email). */
export async function listMyInvites(actor: Actor, now = new Date()) {
  const me = await prisma.playerProfile.findFirst({
    where: { userId: actor.userId, deletedAt: null },
    select: { id: true, user: { select: { email: true } } },
  });
  if (!me) return [];
  const rows = await prisma.partnerInvite.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { gt: now },
      OR: [{ toPlayerId: me.id }, ...(me.user ? [{ toEmail: me.user.email }] : [])],
      registration: { status: { in: LIVE } },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      fromPlayer: { select: { firstName: true, lastNamePrefix: true, lastName: true } },
      registration: {
        select: {
          event: {
            select: {
              discipline: true,
              name: true,
              ageCategory: { select: { code: true, name: true } },
              levelClass: { select: { code: true } },
              tournament: { select: { slug: true, name: true, startsOn: true, endsOn: true } },
            },
          },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    from: fullName(r.fromPlayer),
    event: r.registration.event,
    tournament: r.registration.event.tournament,
  }));
}

// ── Withdrawals and the waiting list ───────────────────────────────────────────────

/** Moves the first waitlisted entries up while there is room; returns who was promoted. */
async function promoteFromWaitlist(tx: Prisma.TransactionClient, eventId: string, now: Date) {
  await tx.$queryRaw`SELECT id FROM "TournamentEvent" WHERE id = ${eventId}::uuid FOR UPDATE`;
  const event = await tx.tournamentEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { maxEntries: true, feeCents: true },
  });
  // Paid online: the promoted pair gets 48 hours to pay before the place moves on.
  const mustPay = event.feeCents > 0 && (await paymentsEnabled());
  const taken = await tx.registration.count({ where: { eventId, status: { in: ACTIVE } } });
  const room = event.maxEntries === null ? Number.MAX_SAFE_INTEGER : event.maxEntries - taken;
  const waiting = await tx.registration.findMany({
    where: { eventId, status: 'WAITLISTED' },
    orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const promoted = waiting.slice(0, Math.max(0, room));
  for (const w of promoted) {
    await tx.registration.update({
      where: { id: w.id },
      data: mustPay
        ? {
            status: 'PENDING',
            waitlistPosition: null,
            holdExpiresAt: new Date(now.getTime() + PROMOTION_HOURS * 3_600_000),
          }
        : { status: 'CONFIRMED', waitlistPosition: null, confirmedAt: now },
    });
  }
  // Renumber the rest 1, 2, 3 …
  const rest = waiting.slice(promoted.length);
  for (const [i, w] of rest.entries()) {
    await tx.registration.update({ where: { id: w.id }, data: { waitlistPosition: i + 1 } });
  }
  return promoted.map((p) => p.id);
}

async function notifyPromoted(registrationIds: string[]) {
  if (registrationIds.length === 0) return;
  const rows = await prisma.registration.findMany({
    where: { id: { in: registrationIds } },
    select: {
      event: {
        select: {
          discipline: true,
          name: true,
          ageCategory: { select: { code: true, name: true } },
          levelClass: { select: { code: true } },
          tournament: { select: { name: true } },
        },
      },
      participants: {
        where: { active: true },
        select: {
          player: { select: { firstName: true, user: { select: { email: true, locale: true } } } },
        },
      },
    },
  });
  for (const r of rows) {
    for (const p of r.participants) {
      const user = p.player.user;
      if (!user) continue;
      const locale = user.locale as AppLocale;
      await sendMailSafely(
        await renderEmail(user.email, locale, {
          kind: 'waitlistPromoted',
          name: p.player.firstName,
          tournament: r.event.tournament.name,
          event: eventText(r.event, locale),
          url: appUrl(locale, '/account?tab=upcoming'),
        }),
      );
    }
  }
}

async function cancelRegistration(
  registrationId: string,
  actorId: string | null,
  reason: string | undefined,
  meta: RequestMeta | undefined,
  action: string,
  now: Date,
) {
  const promoted = await prisma.$transaction(async (tx) => {
    const r = await tx.registration.findUniqueOrThrow({
      where: { id: registrationId },
      select: {
        id: true,
        status: true,
        eventId: true,
        participants: { where: { active: true }, select: { playerId: true } },
      },
    });
    await tx.registration.update({
      where: { id: r.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelReason: reason ?? null,
        waitlistPosition: null,
      },
    });
    await tx.registrationParticipant.updateMany({
      where: { registrationId: r.id },
      data: { active: false },
    });
    await tx.partnerInvite.updateMany({
      where: { registrationId: r.id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: now },
    });
    await tx.partnerRequest.updateMany({
      where: { eventId: r.eventId, playerId: { in: r.participants.map((p) => p.playerId) } },
      data: { closedAt: now },
    });
    await writeAudit(tx, {
      actorId,
      action,
      entityType: 'Registration',
      entityId: r.id,
      before: { status: r.status },
      after: { status: 'CANCELLED', reason: reason ?? null },
      meta,
    });
    return promoteFromWaitlist(tx, r.eventId, now);
  });
  await notifyPromoted(promoted);
}

/** A player withdraws an entry (theirs or their pair's) before the withdrawal deadline. */
export async function withdrawMyRegistration(
  actor: Actor,
  registrationId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const { reason } = parseInput(withdrawSchema, input ?? {});
  const player = await myPlayer(actor);
  const r = await prisma.registration.findFirst({
    where: {
      id: registrationId,
      status: { in: LIVE },
      participants: { some: { playerId: player.id, active: true } },
    },
    select: {
      id: true,
      event: {
        select: {
          discipline: true,
          name: true,
          ageCategory: { select: { code: true, name: true } },
          levelClass: { select: { code: true } },
          tournament: { select: { name: true, withdrawalDeadline: true } },
        },
      },
      participants: {
        where: { active: true },
        select: {
          player: {
            select: { id: true, firstName: true, user: { select: { email: true, locale: true } } },
          },
        },
      },
    },
  });
  if (!r) throw new AppError('notFound');
  if (now >= r.event.tournament.withdrawalDeadline) throw new AppError('withdrawalClosed');
  await cancelRegistration(r.id, actor.userId, reason, meta, 'registration.withdraw', now);
  for (const p of r.participants) {
    const user = p.player.user;
    if (!user) continue;
    const locale = user.locale as AppLocale;
    await sendMailSafely(
      await renderEmail(user.email, locale, {
        kind: 'entryWithdrawn',
        name: p.player.firstName,
        tournament: r.event.tournament.name,
        event: eventText(r.event, locale),
        byPartner: p.player.id !== player.id,
      }),
    );
  }
  // Paid shares go back per the tournament's refund policy (D51).
  await refundsForCancelledRegistration(r.id, 'policy', actor.userId, meta);
}

// ── Organiser: entry list ─────────────────────────────────────────────────────────

export type EntryFilters = { eventId?: string; status?: RegistrationStatus | 'ALL' };

export async function listTournamentEntries(
  actor: Actor,
  tournamentId: string,
  filters: EntryFilters = {},
) {
  await assertCanManageTournament(actor, tournamentId);
  const statusFilter =
    !filters.status || filters.status === 'ALL' ? { in: LIVE } : { equals: filters.status };
  const rows = await prisma.registration.findMany({
    where: {
      event: { tournamentId, deletedAt: null, ...(filters.eventId ? { id: filters.eventId } : {}) },
      status: statusFilter,
    },
    orderBy: [
      { event: { sortOrder: 'asc' } },
      { event: { discipline: 'asc' } },
      { status: 'asc' },
      { waitlistPosition: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      createdAt: true,
      cancelReason: true,
      termsAcceptedAt: true,
      event: {
        select: {
          id: true,
          discipline: true,
          name: true,
          ageCategory: { select: { code: true, name: true } },
          levelClass: { select: { code: true } },
        },
      },
      participants: {
        orderBy: { role: 'asc' },
        select: {
          id: true,
          role: true,
          active: true,
          paymentStatus: true,
          player: {
            select: {
              memberNumber: true,
              firstName: true,
              lastNamePrefix: true,
              lastName: true,
              gender: true,
              dateOfBirth: true,
              phone: true,
              contactEmail: true,
              user: { select: { email: true } },
              club: { select: { name: true } },
            },
          },
        },
      },
      invites: {
        where: { status: 'PENDING' },
        take: 1,
        select: {
          toEmail: true,
          toPlayer: { select: { firstName: true, lastNamePrefix: true, lastName: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    ...r,
    participants: r.participants.filter((p) => p.active || r.status === 'CANCELLED'),
  }));
}

export async function entryCounts(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const rows = await prisma.registration.groupBy({
    by: ['eventId', 'status'],
    where: { event: { tournamentId, deletedAt: null } },
    _count: { _all: true },
  });
  return rows;
}

export async function cancelEntryAsOrganiser(
  actor: Actor,
  registrationId: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
) {
  const { reason } = parseInput(withdrawSchema, input ?? {});
  const r = await prisma.registration.findFirst({
    where: { id: registrationId, status: { in: LIVE } },
    select: { id: true, event: { select: { tournamentId: true } } },
  });
  if (!r) throw new AppError('notFound');
  await assertCanManageTournament(actor, r.event.tournamentId);
  await cancelRegistration(r.id, actor.userId, reason, meta, 'registration.cancelByOrganiser', now);
  // Cancelled by the organisers: whatever was paid goes back in full.
  await refundsForCancelledRegistration(r.id, 'full', actor.userId, meta);
}

/**
 * Releases places whose payment hold ran out (lazy on entry pages + the housekeeping cron).
 * Entries with a payment in progress (iDEAL can take a moment) are left alone.
 */
export async function expireStaleHolds(now = new Date()) {
  const stale = await prisma.registration.findMany({
    where: {
      status: 'PENDING',
      holdExpiresAt: { lt: now },
      orderItems: {
        none: { order: { payments: { some: { status: { in: ['PROCESSING', 'SUCCEEDED'] } } } } },
      },
    },
    select: { id: true },
    take: 200,
  });
  for (const r of stale) {
    await cancelRegistration(r.id, null, 'holdExpired', undefined, 'registration.holdExpired', now);
  }
  await prisma.order.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
      payments: { none: { status: { in: ['PROCESSING', 'SUCCEEDED'] } } },
    },
    data: { status: 'EXPIRED' },
  });
  return stale.length;
}

/** Entry list as a table for the Excel export (organisers need contact details on the day). */
export async function exportTournamentEntries(
  actor: Actor,
  tournamentId: string,
  filters: EntryFilters,
  locale: AppLocale,
) {
  const rows = await listTournamentEntries(actor, tournamentId, filters);
  const header = [
    'event',
    'status',
    'waitlistPosition',
    'role',
    'memberNumber',
    'firstName',
    'lastNamePrefix',
    'lastName',
    'gender',
    'dateOfBirth',
    'club',
    'email',
    'phone',
    'payment',
    'pendingPartner',
    'enteredAt',
  ];
  const data: (string | number)[][] = [];
  for (const r of rows) {
    const pending = r.invites[0]
      ? r.invites[0].toPlayer
        ? fullName(r.invites[0].toPlayer)
        : (r.invites[0].toEmail ?? '')
      : '';
    for (const p of r.participants) {
      data.push([
        eventText(r.event, locale),
        r.status,
        r.waitlistPosition ?? '',
        p.role,
        p.player.memberNumber,
        p.player.firstName,
        p.player.lastNamePrefix ?? '',
        p.player.lastName,
        p.player.gender,
        p.player.dateOfBirth.toISOString().slice(0, 10),
        p.player.club?.name ?? '',
        p.player.user?.email ?? p.player.contactEmail ?? '',
        p.player.phone ?? '',
        p.paymentStatus,
        p.role === 'PRIMARY' ? pending : '',
        r.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      ]);
    }
  }
  return { header, rows: data };
}

// ── Partner search (D59) ───────────────────────────────────────────────────────────

const PARTNER_SEARCH_LIMIT = { limit: 60, windowSeconds: 5 * 60 };

/**
 * Registered players who could be my partner in a doubles event: matching the name (every
 * word) or member number, eligible for the event and as a pair with me, not yet entered.
 * Returns only name, club and member number (no contact details or ages), at most 8.
 */
export async function searchPartners(actor: Actor, slug: string, eventId: string, query: string) {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (q.length < 2) return [];
  await enforce(`partnersearch:user:${actor.userId}`, PARTNER_SEARCH_LIMIT);
  const [t, me] = await Promise.all([loadTournament(slug), myPlayer(actor)]);
  const event = t.events.find((e) => e.id === eventId);
  if (!event || !isDoubles(event.discipline)) return [];

  const words = q.split(' ').filter(Boolean);
  const byNumber = /^TE\d{6}$/i.test(q);
  const candidates = await prisma.playerProfile.findMany({
    where: {
      deletedAt: null,
      mergedIntoId: null,
      id: { not: me.id },
      ...(byNumber
        ? { memberNumber: q.toUpperCase() }
        : {
            AND: words.map((w) => ({
              OR: [
                { firstName: { contains: w, mode: 'insensitive' as const } },
                { lastName: { contains: w, mode: 'insensitive' as const } },
                { lastNamePrefix: { contains: w, mode: 'insensitive' as const } },
              ],
            })),
          }),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 40,
    select: { ...playerSelect, club: { select: { name: true, shortName: true } } },
  });
  const entered = new Set(
    (
      await prisma.registrationParticipant.findMany({
        where: {
          eventId,
          active: true,
          playerId: { in: candidates.map((c) => c.id) },
          registration: { status: { in: LIVE } },
        },
        select: { playerId: true },
      })
    ).map((r) => r.playerId),
  );
  return candidates
    .filter(
      (p) =>
        !entered.has(p.id) &&
        eligibility(p, event, t.startsOn).length === 0 &&
        pairEligibility(event.discipline, me, p).length === 0,
    )
    .slice(0, 8)
    .map((p) => ({
      memberNumber: p.memberNumber,
      name: fullName(p),
      club: p.club?.shortName ?? p.club?.name ?? null,
    }));
}
