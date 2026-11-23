/**
 * Player feedback on a tournament (after it has ended). A comment is shown publicly only when the
 * player ticked the public-display box and the organiser or admin chose where to publish it.
 */
import { type FeedbackStatus, Prisma, prisma } from '@tourneasy/db';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { assertCanManageTournament, isAdmin } from './permissions';
import type { Actor } from './session-service';

export const FEEDBACK_MAX = 500;

export type FeedbackInput = { rating: unknown; comment: unknown; shareConsent: boolean };

/** A player leaves feedback once, for a tournament that has ended and is published. */
export async function submitFeedback(
  actor: Actor,
  tournamentId: string,
  input: FeedbackInput,
  meta: RequestMeta,
) {
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: actor.userId },
    select: { id: true, firstName: true },
  });
  if (!profile) throw new AppError('noPlayerProfile');
  if (!(await hasEntered(profile.id, tournamentId))) throw new AppError('forbidden');

  const rating = Number(input.rating);
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError('validation');
  if (comment.length === 0 || comment.length > FEEDBACK_MAX) throw new AppError('validation');

  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { isPublished: true, endsOn: true },
  });
  if (!t?.isPublished) throw new AppError('notFound');
  if (t.endsOn.getTime() > Date.now()) throw new AppError('feedbackNotOpen');

  const existing = await prisma.tournamentFeedback.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId: profile.id } },
    select: { id: true },
  });
  if (existing) throw new AppError('feedbackAlreadySent');

  const row = await prisma.tournamentFeedback.create({
    data: {
      tournamentId,
      playerId: profile.id,
      firstName: profile.firstName,
      rating,
      comment,
      shareConsent: input.shareConsent === true,
    },
    select: { id: true },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'feedback.submit',
    entityType: 'TournamentFeedback',
    entityId: row.id,
    after: { rating, shareConsent: input.shareConsent === true },
    meta,
  });
  return row;
}

export async function listFeedback(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  return prisma.tournamentFeedback.findMany({
    where: { tournamentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      rating: true,
      comment: true,
      shareConsent: true,
      status: true,
      createdAt: true,
    },
  });
}

/** Organiser or admin decides where a comment shows. Public places need the player's consent. */
export async function moderateFeedback(
  actor: Actor,
  feedbackId: string,
  status: 'TOURNAMENT' | 'WEBSITE' | 'PRIVATE' | 'REJECTED',
  meta: RequestMeta,
) {
  const row = await prisma.tournamentFeedback.findUnique({
    where: { id: feedbackId },
    select: { tournamentId: true, shareConsent: true },
  });
  if (!row) throw new AppError('notFound');
  await assertCanManageTournament(actor, row.tournamentId);
  const isPublic = status === 'TOURNAMENT' || status === 'WEBSITE';
  if (isPublic && !row.shareConsent) throw new AppError('feedbackNoConsent');
  await prisma.tournamentFeedback.update({
    where: { id: feedbackId },
    data: { status, moderatedAt: new Date(), moderatedById: actor.userId },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'feedback.moderate',
    entityType: 'TournamentFeedback',
    entityId: feedbackId,
    after: { status },
    meta,
  });
}

/** Published comments for a tournament page (its own and website-wide ones). */
export async function publicFeedbackFor(tournamentId: string) {
  return prisma.tournamentFeedback.findMany({
    where: { tournamentId, status: { in: ['TOURNAMENT', 'WEBSITE'] } },
    orderBy: { moderatedAt: 'desc' },
    select: { id: true, firstName: true, rating: true, comment: true, moderatedAt: true },
  });
}

/** Website-wide published comments, across tournaments. */
export async function publicWebsiteFeedback(limit = 100) {
  const rows = await prisma.tournamentFeedback.findMany({
    where: { status: 'WEBSITE', tournament: { isPublished: true } },
    orderBy: { moderatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      firstName: true,
      rating: true,
      comment: true,
      tournament: { select: { name: true, slug: true } },
    },
  });
  return rows;
}

/** The id of a published tournament, from its public slug. */
export async function tournamentIdForSlug(slug: string): Promise<string | null> {
  const t = await prisma.tournament.findFirst({
    where: { slug, isPublished: true },
    select: { id: true },
  });
  return t?.id ?? null;
}

/** Only players who entered the tournament (and did not withdraw) may leave feedback on it. */
async function hasEntered(playerId: string, tournamentId: string): Promise<boolean> {
  const row = await prisma.registrationParticipant.findFirst({
    where: {
      playerId,
      active: true,
      registration: { cancelledAt: null, event: { tournamentId } },
    },
    select: { id: true },
  });
  return row !== null;
}

/** What the feedback box on a tournament page should offer this visitor. */
export async function feedbackStateFor(
  actor: Actor | null,
  tournamentId: string,
): Promise<'signedOut' | 'noProfile' | 'notEntered' | 'sent' | 'open'> {
  if (!actor) return 'signedOut';
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: actor.userId },
    select: { id: true },
  });
  if (!profile) return 'noProfile';
  if (!(await hasEntered(profile.id, tournamentId))) return 'notEntered';
  const existing = await prisma.tournamentFeedback.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId: profile.id } },
    select: { id: true },
  });
  return existing ? 'sent' : 'open';
}

export const PUBLIC_RATING_MIN = 5;
const PUBLISHED: FeedbackStatus[] = ['TOURNAMENT', 'WEBSITE'];
type InboxTab = 'new' | 'published' | 'private' | 'rejected';
const TAB_STATUS: Record<InboxTab, FeedbackStatus[]> = {
  new: ['NEW'],
  published: PUBLISHED,
  private: ['PRIVATE'],
  rejected: ['REJECTED'],
};

/** Tournaments the actor may see in the inbox: null means all (admins), else their own ids. */
async function manageableIds(actor: Actor): Promise<string[] | null> {
  if (isAdmin(actor)) return null;
  const links = await prisma.tournamentOrganiser.findMany({
    where: { userId: actor.userId },
    select: { tournamentId: true },
  });
  return links.map((l) => l.tournamentId);
}

/** The organiser inbox: one list across tournaments, filtered by tab and tournament. */
export async function listInbox(actor: Actor, filter: { tab: InboxTab; tournamentId?: string }) {
  const ids = await manageableIds(actor);
  const scope: Prisma.TournamentFeedbackWhereInput = ids ? { tournamentId: { in: ids } } : {};
  const rows = await prisma.tournamentFeedback.findMany({
    where: {
      AND: [
        scope,
        { status: { in: TAB_STATUS[filter.tab] } },
        filter.tournamentId ? { tournamentId: filter.tournamentId } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      firstName: true,
      rating: true,
      comment: true,
      shareConsent: true,
      status: true,
      createdAt: true,
      tournament: { select: { id: true, name: true } },
    },
  });
  const counts = await prisma.tournamentFeedback.groupBy({
    by: ['status'],
    where: scope,
    _count: { _all: true },
  });
  const count = (s: FeedbackStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const tabCounts = {
    new: count('NEW'),
    published: count('TOURNAMENT') + count('WEBSITE'),
    private: count('PRIVATE'),
    rejected: count('REJECTED'),
  };
  const tournaments = await prisma.tournament.findMany({
    where: ids ? { id: { in: ids } } : {},
    orderBy: { startsOn: 'desc' },
    select: { id: true, name: true },
    take: 100,
  });
  // Average of everything received, for the owner's own view.
  const received = await prisma.tournamentFeedback.aggregate({
    where: scope,
    _avg: { rating: true },
    _count: { _all: true },
  });
  return { rows, tabCounts, tournaments, received };
}

/** Public rating for a tournament: published comments only, and only once there are enough. */
export async function publicRatingFor(tournamentId: string) {
  const agg = await prisma.tournamentFeedback.aggregate({
    where: { tournamentId, status: { in: PUBLISHED } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  if (agg._count._all < PUBLIC_RATING_MIN) return null;
  return { average: agg._avg.rating ?? 0, count: agg._count._all };
}
