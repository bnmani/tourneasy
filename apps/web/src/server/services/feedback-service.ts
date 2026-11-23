/**
 * Player feedback on a tournament (after it has ended). A comment is shown publicly only when the
 * player ticked the public-display box and the organiser or admin chose where to publish it.
 */
import { prisma } from '@tourneasy/db';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { assertCanManageTournament } from './permissions';
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
export async function publicWebsiteFeedback() {
  const rows = await prisma.tournamentFeedback.findMany({
    where: { status: 'WEBSITE', tournament: { isPublished: true } },
    orderBy: { moderatedAt: 'desc' },
    take: 100,
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

/** What the feedback box on a tournament page should offer this visitor. */
export async function feedbackStateFor(
  actor: Actor | null,
  tournamentId: string,
): Promise<'signedOut' | 'noProfile' | 'sent' | 'open'> {
  if (!actor) return 'signedOut';
  const profile = await prisma.playerProfile.findUnique({
    where: { userId: actor.userId },
    select: { id: true },
  });
  if (!profile) return 'noProfile';
  const existing = await prisma.tournamentFeedback.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId: profile.id } },
    select: { id: true },
  });
  return existing ? 'sent' : 'open';
}
