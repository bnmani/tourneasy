'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Breadcrumbs, type Crumb } from './breadcrumbs';

const SECTIONS = [
  '',
  'settings',
  'entries',
  'draws',
  'schedule',
  'matches',
  'payments',
  'news',
  'log',
] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Above every tournament page in the portal: a switcher to the same section of another
 * tournament, and tabs for the tournament's sections.
 */
export function TournamentBar({
  current,
  tournaments,
}: {
  current: string;
  tournaments: { id: string; name: string; when: string }[];
}) {
  const t = useTranslations('Admin.tournamentBar');
  const ta = useTranslations('Admin');
  const pathname = usePathname();
  const router = useRouter();
  const rest = pathname.split(`/admin/tournaments/${current}`)[1] ?? '';
  // Sub-pages (one category's draw, a new event…) belong to their section.
  const first = rest.split('/')[1] ?? '';
  const section: Section = (SECTIONS as readonly string[]).includes(first)
    ? (first as Section)
    : '';
  const href = (id: string, s: Section) => `/admin/tournaments/${id}${s ? `/${s}` : ''}`;
  // Deeper than the section itself (one category's draw, a new event…): the section is a link.
  const deeper = rest.split('/').filter(Boolean).length > (section ? 1 : 0);
  const name = tournaments.find((x) => x.id === current)?.name ?? '';
  const crumbs: Crumb[] = [
    { label: ta('navTournaments'), href: '/admin/tournaments' },
    { label: name, href: section || deeper ? href(current, '') : undefined },
    ...(section
      ? [
          {
            label: t(`section_${section}` as 'section_overview'),
            href: deeper ? href(current, section) : undefined,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <Breadcrumbs items={crumbs} label={t('breadcrumbs')} />
      <label className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
        <span className="font-medium whitespace-nowrap">{t('switch')}</span>
        <select
          value={current}
          onChange={(e) => router.push(href(e.target.value, section))}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base sm:max-w-md sm:text-sm"
        >
          {tournaments.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.when}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label={t('sections')} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {SECTIONS.map((s) => (
          <Link
            key={s || 'overview'}
            href={href(current, s)}
            aria-current={s === section ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              s === section ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {t(`section_${s || 'overview'}` as 'section_overview')}
          </Link>
        ))}
      </nav>
    </div>
  );
}
