import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale } from '@/lib/page';
import { cn } from '@/lib/utils';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { drawOverview } from '@/server/services/draw-service';
import { getTournament } from '@/server/services/tournament-service';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.draws' });
  return { title: t('title'), robots: { index: false } };
}

/** Organisers: every event with its number of entries and draw status (D55). */
export default async function DrawsOverviewPage({ params }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const events = await drawOverview(actor, id);
  const t = await getTranslations('Admin');
  const tf = await getTranslations('DrawTypes');
  return (
    <>
      <PageHeader
        title={t('draws.overviewTitle', { tournament: tournament.name })}
        intro={t('draws.intro')}
      />
      <ul className="divide-y rounded-lg border bg-card">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium">{e.label}</p>
              <p className="text-sm text-muted-foreground">
                {tf(e.drawType)} · {t('draws.entryCount', { count: e.entries })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-bold',
                  e.status === 'PUBLISHED' && 'bg-primary text-primary-foreground',
                  e.status === 'DRAFT' && 'bg-brand text-brand-foreground',
                  e.status === 'NONE' && 'bg-muted text-muted-foreground',
                )}
              >
                {t(`draws.status${e.status as 'NONE' | 'DRAFT' | 'PUBLISHED'}`)}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/tournaments/${id}/draws/${e.id}`}>{t('draws.open')}</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
