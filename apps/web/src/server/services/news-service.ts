/**
 * Organiser news per tournament (D62): shown on the tournament page once published, and
 * optionally emailed once to everyone entered (an optional email players can switch off).
 */
import { prisma } from '@tourneasy/db';
import { newsSchema } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { randomToken } from '../lib/crypto';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { appUrl } from '../lib/urls';
import { parseInput } from '../lib/validation';
import { enqueueEmails } from './notification-service';
import { assertCanManageTournament } from './permissions';
import type { Actor } from './session-service';

type Localized = { nl: string; en?: string };
const pick = (v: unknown, locale: AppLocale) => {
  const o = (v ?? {}) as Localized;
  return (locale === 'en' && o.en) || o.nl || '';
};

export async function listNews(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  return prisma.announcement.findMany({
    where: { tournamentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      emailSentAt: true,
      createdAt: true,
    },
  });
}

export async function createNews(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const data = parseInput(newsSchema, input);
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { slug: true, isPublished: true },
  });
  const news = await prisma.announcement.create({
    data: {
      tournamentId,
      slug: `${t.slug}-${randomToken(6).toLowerCase()}`,
      title: { nl: data.titleNl, ...(data.titleEn ? { en: data.titleEn } : {}) },
      body: { nl: data.bodyNl, ...(data.bodyEn ? { en: data.bodyEn } : {}) },
      publishedAt: data.publish ? new Date() : null,
      authorId: actor.userId,
    },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'news.create',
    entityType: 'Announcement',
    entityId: news.id,
    after: { publish: data.publish, email: data.email },
    meta,
  });
  if (data.publish && data.email) await emailNews(actor, news.id, meta);
  return news;
}

export async function setNewsPublished(
  actor: Actor,
  newsId: string,
  publish: boolean,
  meta: RequestMeta,
) {
  const news = await loadNews(newsId);
  await assertCanManageTournament(actor, news.tournamentId!);
  await prisma.announcement.update({
    where: { id: newsId },
    data: { publishedAt: publish ? (news.publishedAt ?? new Date()) : null },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: publish ? 'news.publish' : 'news.unpublish',
    entityType: 'Announcement',
    entityId: newsId,
    meta,
  });
}

export async function deleteNews(actor: Actor, newsId: string, meta: RequestMeta) {
  const news = await loadNews(newsId);
  await assertCanManageTournament(actor, news.tournamentId!);
  await prisma.announcement.delete({ where: { id: newsId } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'news.delete',
    entityType: 'Announcement',
    entityId: newsId,
    meta,
  });
}

async function loadNews(newsId: string) {
  const news = await prisma.announcement.findUnique({ where: { id: newsId } });
  if (!news?.tournamentId) throw new AppError('notFound');
  return news;
}

/** Emails a published news item once to everyone entered in the tournament. */
export async function emailNews(actor: Actor, newsId: string, meta: RequestMeta) {
  const news = await loadNews(newsId);
  await assertCanManageTournament(actor, news.tournamentId!);
  if (!news.publishedAt) throw new AppError('statusTransition');
  if (news.emailSentAt) throw new AppError('newsAlreadyEmailed');
  const t = await prisma.tournament.findUniqueOrThrow({
    where: { id: news.tournamentId! },
    select: { id: true, name: true, slug: true },
  });
  const rows = await prisma.registrationParticipant.findMany({
    where: {
      active: true,
      registration: {
        status: { in: ['CONFIRMED', 'PENDING', 'WAITLISTED'] },
        event: { tournamentId: t.id },
      },
      player: { userId: { not: null }, deletedAt: null },
    },
    select: { player: { select: { userId: true, firstName: true } } },
  });
  const players = [...new Map(rows.map((r) => [r.player.userId!, r.player])).values()];
  const count = await enqueueEmails(
    players.map((p) => ({
      userId: p.userId!,
      type: 'ANNOUNCEMENT' as const,
      dedupeKey: `NEWS:${news.id}:${p.userId}`,
      linkPath: `/tournaments/${t.slug}`,
      template: (locale: AppLocale) => ({
        kind: 'news' as const,
        name: p.firstName,
        tournament: t.name,
        title: pick(news.title, locale),
        body: pick(news.body, locale),
        url: appUrl(locale, `/tournaments/${t.slug}#news`),
      }),
    })),
  );
  await prisma.announcement.update({ where: { id: newsId }, data: { emailSentAt: new Date() } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'news.email',
    entityType: 'Announcement',
    entityId: newsId,
    after: { recipients: count },
    meta,
  });
  return count;
}

/** Public: published news of a tournament, newest first. */
export async function publicNews(tournamentSlug: string, locale: AppLocale) {
  const rows = await prisma.announcement.findMany({
    where: {
      publishedAt: { not: null },
      tournament: { slug: tournamentSlug, isPublished: true, deletedAt: null },
    },
    orderBy: { publishedAt: 'desc' },
    take: 20,
    select: { id: true, title: true, body: true, publishedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: pick(r.title, locale),
    body: pick(r.body, locale),
    publishedAt: r.publishedAt!,
  }));
}
