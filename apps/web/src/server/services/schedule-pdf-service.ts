/**
 * The schedule PDF (D73): the published schedule for everyone; before publishing only the
 * tournament's organisers and admins, marked as a draft.
 */
import { prisma } from '@tourneasy/db';
import { formatDayRange } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { AppError } from '../lib/errors';
import { appUrl } from '../lib/urls';
import { buildSchedulePdf } from '../pdf/schedule-pdf';
import { tournamentLogoFile } from './logo-service';
import { canManageTournament } from './permissions';
import { getSchedule, publicSchedule } from './schedule-service';
import type { Actor } from './session-service';

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function schedulePdf(actor: Actor | null, slug: string, locale: AppLocale) {
  const t = await prisma.tournament.findFirst({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      startsOn: true,
      endsOn: true,
      isPublished: true,
      schedulePublishedAt: true,
      venue: { select: { name: true, city: true } },
    },
  });
  if (!t) throw new AppError('notFound');
  const manager = actor ? await canManageTournament(actor, t.id) : false;
  const published = t.isPublished && !!t.schedulePublishedAt;
  if (!published && !manager) throw new AppError('notFound');

  const items = published
    ? (await publicSchedule(t.slug, locale)).items
    : (await getSchedule(actor!, t.id, locale)).scheduled;
  const logo = await tournamentLogoFile(t.id);
  const bytes = await buildSchedulePdf({
    locale,
    tournament: {
      name: t.name,
      when: formatDayRange(day(t.startsOn), day(t.endsOn), locale, 'long'),
      venue: t.venue ? `${t.venue.name}, ${t.venue.city}` : null,
      url: appUrl(locale, `/tournaments/${t.slug}/schedule`),
    },
    logo: logo ? { bytes: new Uint8Array(logo.data), mimeType: logo.mimeType } : null,
    matches: items.map((i) => ({
      number: i.number,
      event: i.event,
      round: i.round,
      a: i.a,
      b: i.b,
      startsAt: i.startsAt,
      court: i.court,
      status: i.status,
      sets: i.sets,
    })),
    draft: !published,
    generatedAt: new Date(),
  });
  return { bytes, filename: `${locale === 'nl' ? 'speelschema' : 'schedule'}-${t.slug}.pdf` };
}
