/**
 * Schedule exports: the PDF (D73), Excel and, for the desk, one page per court (D79). The
 * published schedule is for everyone; before publishing only the tournament's organisers and
 * admins get it, marked as a draft. The per-court PDF is for organisers and admins only.
 */
import { prisma } from '@tourneasy/db';
import { formatDate, formatDayRange, formatTime, utcToAmsterdamLocal } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { AppError } from '../lib/errors';
import { appUrl } from '../lib/urls';
import { toXlsxBook, type XlsxSheet } from '../lib/xlsx';
import { buildCourtsPdf } from '../pdf/courts-pdf';
import { buildSchedulePdf, type PdfMatch } from '../pdf/schedule-pdf';
import { tournamentLogoFile } from './logo-service';
import { canManageTournament } from './permissions';
import { getSchedule, publicSchedule } from './schedule-service';
import type { Actor } from './session-service';

const day = (d: Date) => d.toISOString().slice(0, 10);

type ExportMatch = PdfMatch & { aClub: string | null; bClub: string | null };

async function loadSchedule(
  actor: Actor | null,
  slug: string,
  locale: AppLocale,
  options: { managersOnly?: boolean } = {},
) {
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
  if ((!published || options.managersOnly) && !manager) throw new AppError('notFound');

  const items = published
    ? (await publicSchedule(t.slug, locale)).items
    : (await getSchedule(actor!, t.id, locale)).scheduled;
  const matches: ExportMatch[] = items
    .filter((i) => i.startsAt && i.court)
    .map((i) => ({
      number: i.number,
      event: i.event,
      round: i.round,
      a: i.a,
      b: i.b,
      aClub: i.aClub,
      bClub: i.bClub,
      startsAt: i.startsAt,
      court: i.court,
      status: i.status,
      sets: i.sets,
    }))
    .sort(
      (p, q) => p.startsAt!.getTime() - q.startsAt!.getTime() || p.court!.number - q.court!.number,
    );
  const logo = await tournamentLogoFile(t.id);
  return {
    t,
    published,
    matches,
    logo: logo ? { bytes: new Uint8Array(logo.data), mimeType: logo.mimeType } : null,
    tournament: {
      name: t.name,
      when: formatDayRange(day(t.startsOn), day(t.endsOn), locale, 'long'),
      venue: t.venue ? `${t.venue.name}, ${t.venue.city}` : null,
      url: appUrl(locale, `/tournaments/${t.slug}/schedule`),
    },
  };
}

const fileName = (locale: AppLocale, kind: 'schedule' | 'courts', slug: string, ext: string) =>
  `${locale === 'nl' ? (kind === 'schedule' ? 'speelschema' : 'banen') : kind}-${slug}.${ext}`;

export async function schedulePdf(actor: Actor | null, slug: string, locale: AppLocale) {
  const s = await loadSchedule(actor, slug, locale);
  const bytes = await buildSchedulePdf({
    locale,
    tournament: s.tournament,
    logo: s.logo,
    matches: s.matches,
    draft: !s.published,
    generatedAt: new Date(),
  });
  return { bytes, filename: fileName(locale, 'schedule', s.t.slug, 'pdf') };
}

/** One page per court, matches in order: to hang at the court or give to the umpires. */
export async function courtsPdf(actor: Actor | null, slug: string, locale: AppLocale) {
  const s = await loadSchedule(actor, slug, locale, { managersOnly: true });
  const bytes = await buildCourtsPdf({
    locale,
    tournament: s.tournament,
    logo: s.logo,
    matches: s.matches,
    draft: !s.published,
    generatedAt: new Date(),
  });
  return { bytes, filename: fileName(locale, 'courts', s.t.slug, 'pdf') };
}

const XLSX_TEXTS = {
  nl: {
    all: 'Alles',
    header: [
      'Datum',
      'Tijd',
      'Baan',
      'Nr.',
      'Onderdeel',
      'Ronde',
      'Speler(s) A',
      'Club A',
      'Speler(s) B',
      'Club B',
      'Uitslag',
      'Status',
    ],
    tbd: 'nog onbekend',
    draft: 'CONCEPT',
    status: {
      SCHEDULED: 'Gepland',
      CALLED: 'Opgeroepen',
      IN_PROGRESS: 'Bezig',
      COMPLETED: 'Gespeeld',
      WALKOVER: 'Walk-over',
      RETIRED: 'Opgegeven',
      BYE: 'Bye',
      CANCELLED: 'Vervallen',
    },
  },
  en: {
    all: 'All',
    header: [
      'Date',
      'Time',
      'Court',
      'No.',
      'Category',
      'Round',
      'Player(s) A',
      'Club A',
      'Player(s) B',
      'Club B',
      'Result',
      'Status',
    ],
    tbd: 'to be decided',
    draft: 'DRAFT',
    status: {
      SCHEDULED: 'Scheduled',
      CALLED: 'Called',
      IN_PROGRESS: 'In progress',
      COMPLETED: 'Played',
      WALKOVER: 'Walkover',
      RETIRED: 'Retired',
      BYE: 'Bye',
      CANCELLED: 'Cancelled',
    },
  },
} as const;

/**
 * The schedule in Excel (D79): an "All" sheet and one per day, sorted by time and court, with
 * a frozen header and filters so a court or category is one click away.
 */
export async function scheduleXlsx(actor: Actor | null, slug: string, locale: AppLocale) {
  const s = await loadSchedule(actor, slug, locale);
  const tx = XLSX_TEXTS[locale];
  const row = (m: ExportMatch) => [
    utcToAmsterdamLocal(m.startsAt!).slice(0, 10),
    formatTime(m.startsAt!, locale),
    m.court!.name ?? m.court!.number,
    m.number,
    m.event,
    m.round,
    m.a ?? tx.tbd,
    m.aClub ?? '',
    m.b ?? tx.tbd,
    m.bClub ?? '',
    m.status === 'WALKOVER'
      ? tx.status.WALKOVER
      : m.sets.map((x) => `${x.scoreA}-${x.scoreB}`).join(', '),
    tx.status[m.status as keyof typeof tx.status] ?? m.status,
  ];
  const days = [...new Set(s.matches.map((m) => utcToAmsterdamLocal(m.startsAt!).slice(0, 10)))];
  const prefix = s.published ? '' : `${tx.draft} `;
  const sheets: XlsxSheet[] = [
    { name: `${prefix}${tx.all}`, header: [...tx.header], rows: s.matches.map(row) },
    ...(days.length > 1
      ? days.map((d) => ({
          name: `${prefix}${formatDate(new Date(`${d}T12:00:00Z`), locale)}`,
          header: [...tx.header],
          rows: s.matches
            .filter((m) => utcToAmsterdamLocal(m.startsAt!).slice(0, 10) === d)
            .map(row),
        }))
      : []),
  ];
  return { bytes: toXlsxBook(sheets), filename: fileName(locale, 'schedule', s.t.slug, 'xlsx') };
}
