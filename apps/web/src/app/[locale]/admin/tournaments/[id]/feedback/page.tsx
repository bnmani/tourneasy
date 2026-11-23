import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { moderateFeedbackAction } from '@/server/actions/feedback-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { listFeedback } from '@/server/services/feedback-service';
import { getTournament } from '@/server/services/tournament-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Feedback' });
  return { title: t('admin.title'), robots: { index: false } };
}

/** Organisers: player feedback. Each comment goes where the organiser chooses, with consent. */
export default async function FeedbackPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const rows = await listFeedback(actor, id);
  const t = await getTranslations('Feedback.admin');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const rated = await getTranslations('Feedback');

  return (
    <>
      <PageHeader title={t('heading', { tournament: tournament.name })} intro={t('intro')} />
      <StatusNotice status={firstParam((await searchParams).status)} />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const act = (status: 'TOURNAMENT' | 'WEBSITE' | 'PRIVATE' | 'REJECTED') =>
              moderateFeedbackAction.bind(null, locale, id, row.id, status);
            return (
              <li key={row.id} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {row.firstName} · {rated('outOf', { rating: row.rating })}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {when(row.createdAt)} · {t(`status_${row.status}`)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line">{row.comment}</p>
                {!row.shareConsent && (
                  <p className="text-xs text-muted-foreground">{t('noConsent')}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <form action={act('TOURNAMENT')}>
                    <Button type="submit" size="sm" disabled={!row.shareConsent}>
                      {t('toTournament')}
                    </Button>
                  </form>
                  <form action={act('WEBSITE')}>
                    <Button type="submit" size="sm" variant="outline" disabled={!row.shareConsent}>
                      {t('toWebsite')}
                    </Button>
                  </form>
                  <form action={act('PRIVATE')}>
                    <Button type="submit" size="sm" variant="ghost">
                      {t('private')}
                    </Button>
                  </form>
                  <form action={act('REJECTED')}>
                    <Button type="submit" size="sm" variant="ghost">
                      {t('reject')}
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
