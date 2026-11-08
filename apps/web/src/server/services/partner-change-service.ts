/**
 * Change partner (D115): organisers swap the partner of a doubles entry without cancelling it.
 *
 * - The new partner is searched like on "Add entry" (or created). The usual age, gender and
 *   pair rules apply, and the maximum number of categories per player.
 * - A new partner who already plays this category in another entry moves over with whatever
 *   they paid. The player left behind there keeps their entry (it then needs a partner), or the
 *   organiser cancels it, which refunds them in full like any cancellation by the organisers.
 * - The old partner leaves as a cancelled entry of their own (in the cancelled list, with the
 *   reason), and a paid share goes back in full.
 * - Not possible once the draw for the category is made, or when a player is checked in.
 *
 * The first call (`confirm` false) only checks and returns a preview: who leaves, who joins and
 * the money that goes back. The organiser confirms, and the second call makes the change.
 */
import { prisma, type Prisma } from '@tourneasy/db';
import { isDoubles, pairEligibility } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { z } from 'zod';
import { sendMailSafely } from '../email/mailer';
import { renderEmail } from '../email/templates';
import { writeAudit } from '../lib/audit';
import { randomToken } from '../lib/crypto';
import { AppError, validationError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { parseInput } from '../lib/validation';
import { refundPlan } from '../payments/pricing';
import { loadTournament, pickSchema, pickSpec } from './entry-import-service';
import { assertCanManageTournament } from './permissions';
import { namesakes, resolvePlayer } from './player-resolve';
import {
  cancelEntryAsOrganiser,
  eligibility,
  eventText,
  fullName,
  playerEntries,
  type PlayerRow,
} from './registration-service';
import { refundsForCancelledRegistration } from './refund-service';
import type { Actor } from './session-service';

const LIVE = ['PENDING', 'CONFIRMED', 'WAITLISTED'] as const;

const changeSchema = z.object({
  partner: pickSchema,
  /** The organiser saw the possible duplicates and still wants a new player (D82). */
  allowNew: z.boolean().default(false),
  /** The new partner's old entry in this category: keep it for the player left behind, or cancel. */
  leftBehind: z.enum(['keep', 'cancel']).optional(),
  notify: z.boolean().default(true),
  confirm: z.boolean().default(false),
});

const shareSelect = {
  id: true,
  role: true,
  playerId: true,
  paymentStatus: true,
  checkedInAt: true,
  player: {
    select: {
      memberNumber: true,
      firstName: true,
      lastNamePrefix: true,
      lastName: true,
      user: { select: { email: true, locale: true } },
    },
  },
  orderItems: {
    where: { order: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } },
    select: {
      id: true,
      amountCents: true,
      refundedCents: true,
      refunds: {
        where: { status: { in: ['REQUESTED', 'APPROVED', 'PENDING'] } },
        select: { amountCents: true },
      },
    },
  },
} satisfies Prisma.RegistrationParticipantSelect;
type Share = Prisma.RegistrationParticipantGetPayload<{ select: typeof shareSelect }>;

/** What is still paid and not (being) refunded on a share. */
const openCents = (s: Share) =>
  s.orderItems.reduce(
    (n, i) =>
      n + i.amountCents - i.refundedCents - i.refunds.reduce((m, r) => m + r.amountCents, 0),
    0,
  );

/** What a full refund of this share would pay back (the multi-category price included, D109). */
async function refundFor(s: Share) {
  let total = 0;
  for (const item of s.orderItems) {
    const open = item.amountCents - item.refundedCents;
    if (open <= 0 || item.refunds.length > 0) continue;
    const plan = await refundPlan(s.id, open);
    total += plan.selfCents + plan.earlier.reduce((n, e) => n + e.cents, 0);
  }
  return total;
}

async function loadEntry(registrationId: string) {
  return prisma.registration.findFirst({
    where: { id: registrationId, status: { in: [...LIVE] } },
    select: {
      id: true,
      eventId: true,
      event: { select: { tournamentId: true } },
      participants: { where: { active: true }, orderBy: { role: 'asc' }, select: shareSelect },
      _count: { select: { drawEntries: true } },
    },
  });
}

export type PartnerChangePreview = {
  player: string;
  oldPartner: { name: string; refundCents: number } | null;
  newPartner: { name: string; memberNumber: string; paidMoves: boolean };
  /** The new partner's current entry in this category, and the player left behind there. */
  from: { with: string | null; refundCents: number; defaultChoice: 'keep' | 'cancel' } | null;
};

export async function changePartner(
  actor: Actor,
  registrationId: string,
  input: unknown,
  meta: RequestMeta,
  locale: AppLocale = actor.locale,
): Promise<{ preview: PartnerChangePreview } | { done: { name: string; event: string } }> {
  const data = parseInput(changeSchema, input);
  const entry = await loadEntry(registrationId);
  if (!entry) throw new AppError('notFound');
  await assertCanManageTournament(actor, entry.event.tournamentId);
  const t = await loadTournament(entry.event.tournamentId);
  const event = t.events.find((e) => e.id === entry.eventId);
  if (!event || !isDoubles(event.discipline)) throw validationError({ partner: 'invalid' });
  if (entry._count.drawEntries > 0) throw validationError({ partner: 'drawMade' });
  if (entry.participants.some((p) => p.checkedInAt))
    throw validationError({ partner: 'checkedIn' });
  const primary = entry.participants.find((p) => p.role === 'PRIMARY') ?? entry.participants[0];
  if (!primary) throw new AppError('notFound');
  const oldPartner = entry.participants.find((p) => p.id !== primary.id) ?? null;

  // The new partner: picked by member number, or new (ask first about namesakes, D82).
  if (!data.allowNew && 'new' in data.partner) {
    const duplicates = await namesakes(pickSpec(data.partner));
    if (duplicates.length)
      throw new AppError('possibleDuplicate', { duplicates: { partner: duplicates } });
  }
  const resolved = await resolvePlayer(pickSpec(data.partner), { create: data.confirm });
  if (!resolved.ok) {
    // A new player is only created on confirm; until then the preview shows the typed name.
    if (!data.confirm && 'new' in data.partner && resolved.error === 'playerNotFound')
      return {
        preview: {
          player: fullName(primary.player),
          oldPartner: oldPartner
            ? { name: fullName(oldPartner.player), refundCents: await refundFor(oldPartner) }
            : null,
          newPartner: {
            name: fullName({
              ...data.partner.new,
              lastNamePrefix: data.partner.new.lastNamePrefix ?? null,
            }),
            memberNumber: '',
            paidMoves: false,
          },
          from: null,
        },
      };
    throw validationError({
      [`partner.${resolved.field}`]:
        resolved.error === 'playerNotFound' ? 'partnerNotFound' : resolved.error,
    });
  }
  const partner = resolved.player;
  const playerRow = await prisma.playerProfile.findUniqueOrThrow({
    where: { id: primary.playerId },
    select: {
      id: true,
      gender: true,
      dateOfBirth: true,
      levelSingles: { select: { rank: true } },
      levelDoubles: { select: { rank: true } },
      levelMixed: { select: { rank: true } },
    },
  });
  if (partner.id === primary.playerId) throw validationError({ partner: 'partnerSelf' });
  if (partner.id === oldPartner?.playerId) throw validationError({ partner: 'partnerSame' });
  if (
    [
      ...eligibility(partner, event, t.startsOn),
      ...pairEligibility(event.discipline, playerRow as never, partner as never),
    ].length > 0
  )
    throw validationError({ partner: 'partnerIneligible' });

  // Already in this category in another entry: they move over with what they paid.
  const theirs = await prisma.registrationParticipant.findFirst({
    where: {
      eventId: event.id,
      playerId: partner.id,
      active: true,
      registration: { status: { in: [...LIVE] } },
    },
    select: {
      ...shareSelect,
      registration: {
        select: {
          id: true,
          _count: { select: { drawEntries: true } },
          participants: { where: { active: true }, select: shareSelect },
        },
      },
    },
  });
  const leftBehind = theirs?.registration.participants.find((p) => p.id !== theirs.id) ?? null;
  if (theirs) {
    if (theirs.registration._count.drawEntries > 0) throw validationError({ partner: 'drawMade' });
    if (theirs.registration.participants.some((p) => p.checkedInAt))
      throw validationError({ partner: 'checkedIn' });
  } else {
    const entries = await playerEntries(partner.id, t.id);
    if (entries.size >= t.maxEventsPerPlayer)
      throw validationError({ partner: 'partnerMaxEvents' });
  }
  const leftBehindPaid = leftBehind ? openCents(leftBehind) > 0 : false;
  const choice = data.leftBehind ?? (leftBehindPaid ? 'keep' : 'cancel');

  if (!data.confirm)
    return {
      preview: {
        player: fullName(primary.player),
        oldPartner: oldPartner
          ? { name: fullName(oldPartner.player), refundCents: await refundFor(oldPartner) }
          : null,
        newPartner: {
          name: fullName(partner),
          memberNumber: partner.memberNumber,
          paidMoves: theirs ? openCents(theirs) > 0 : false,
        },
        from: theirs
          ? {
              with: leftBehind ? fullName(leftBehind.player) : null,
              refundCents: leftBehind ? await refundFor(leftBehind) : 0,
              defaultChoice: leftBehindPaid ? 'keep' : 'cancel',
            }
          : null,
      },
    };

  const now = new Date();
  const name = fullName(primary.player);
  const reason = `Partner changed: ${fullName(partner)} now plays with ${name}`;
  const shellId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TournamentEvent" WHERE id = ${event.id}::uuid FOR UPDATE`;
    let shell: string | null = null;
    // The old partner leaves as a cancelled entry of their own, with their payment.
    if (oldPartner) {
      const r = await tx.registration.create({
        data: {
          eventId: event.id,
          status: 'CANCELLED',
          cancelledAt: now,
          cancelReason: `Partner changed: replaced by ${fullName(partner)} in the entry with ${name}`,
          createdById: actor.userId,
        },
      });
      shell = r.id;
      await tx.registrationParticipant.update({
        where: { id: oldPartner.id },
        data: { registrationId: r.id, role: 'PRIMARY', active: false },
      });
      await tx.orderItem.updateMany({
        where: { participantId: oldPartner.id },
        data: { registrationId: r.id },
      });
      await writeAudit(tx, {
        actorId: actor.userId,
        action: 'registration.cancelByOrganiser',
        entityType: 'Registration',
        entityId: r.id,
        before: { status: 'CONFIRMED', registrationId: entry.id },
        after: { status: 'CANCELLED', reason: 'partnerChanged' },
        meta,
      });
    }
    if (theirs) {
      await tx.registrationParticipant.update({
        where: { id: theirs.id },
        data: { registrationId: entry.id, role: 'PARTNER' },
      });
      await tx.orderItem.updateMany({
        where: { participantId: theirs.id },
        data: { registrationId: entry.id },
      });
      if (leftBehind && choice === 'keep')
        await tx.registrationParticipant.update({
          where: { id: leftBehind.id },
          data: { role: 'PRIMARY' },
        });
    } else {
      await tx.registrationParticipant.create({
        data: {
          registrationId: entry.id,
          eventId: event.id,
          playerId: partner.id,
          role: 'PARTNER',
          checkInToken: randomToken(18),
          paymentStatus:
            event.feeCents === 0
              ? 'WAIVED'
              : t.partnerPaymentMode === 'INITIATOR_PAYS_ALL'
                ? 'PAID_BY_PARTNER'
                : 'UNPAID',
        },
      });
    }
    // An open invitation for this entry is no longer needed, nor a "looking for a partner".
    await tx.partnerInvite.updateMany({
      where: { registrationId: entry.id, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: now },
    });
    await tx.partnerRequest.updateMany({
      where: { eventId: event.id, playerId: { in: [primary.playerId, partner.id] } },
      data: { closedAt: now },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'registration.partnerChange',
      entityType: 'Registration',
      entityId: entry.id,
      before: { partner: oldPartner?.player.memberNumber ?? null },
      after: {
        partner: partner.memberNumber,
        movedFrom: theirs?.registration.id ?? null,
        leftBehind: leftBehind ? { player: leftBehind.player.memberNumber, choice } : null,
      },
      meta,
    });
    return shell;
  });

  // Money and the entry left behind, as with any cancellation by the organisers.
  if (shellId && oldPartner && openCents(oldPartner) > 0)
    await refundsForCancelledRegistration(shellId, 'full', actor.userId, meta);
  if (theirs && (!leftBehind || choice === 'cancel'))
    await cancelEntryAsOrganiser(actor, theirs.registration.id, { reason }, meta, now);

  if (data.notify)
    await notifyChange({ t, event, primary, partner, oldPartner, leftBehind, choice });
  return { done: { name: `${name} / ${fullName(partner)}`, event: eventText(event, locale) } };
}

async function notifyChange(c: {
  t: Awaited<ReturnType<typeof loadTournament>>;
  event: Awaited<ReturnType<typeof loadTournament>>['events'][number];
  primary: Share;
  partner: PlayerRow;
  oldPartner: Share | null;
  leftBehind: Share | null;
  choice: 'keep' | 'cancel';
}) {
  const send = async (
    to: { email?: string | null; locale?: string | null; firstName: string } | null,
    variant: 'changed' | 'removed' | 'left' | 'leftCancelled',
    partnerName: string,
  ) => {
    if (!to?.email) return;
    const locale = (to.locale as AppLocale | undefined) ?? 'nl';
    await sendMailSafely(
      await renderEmail(to.email, locale, {
        kind: 'partnerChange',
        variant,
        name: to.firstName,
        partner: partnerName,
        tournament: c.t.name,
        event: eventText(c.event, locale),
        url: appUrl(locale, '/account?tab=upcoming'),
      }),
    );
  };
  const who = (s: Share) => ({
    email: s.player.user?.email,
    locale: s.player.user?.locale,
    firstName: s.player.firstName,
  });
  const primaryName = fullName(c.primary.player);
  await send(who(c.primary), 'changed', fullName(c.partner));
  await send(
    {
      email: c.partner.user?.email,
      locale: c.partner.user?.locale,
      firstName: c.partner.firstName,
    },
    'changed',
    primaryName,
  );
  if (c.oldPartner) await send(who(c.oldPartner), 'removed', primaryName);
  if (c.leftBehind)
    await send(
      who(c.leftBehind),
      c.choice === 'keep' ? 'left' : 'leftCancelled',
      fullName(c.partner),
    );
}
