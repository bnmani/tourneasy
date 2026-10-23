import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { NewsForm } from '@/components/admin/news-form';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import {
  deleteNewsAction,
  emailNewsAction,
  publishNewsAction,
} from '@/server/actions/news-actions';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { listNews } from '@/server/services/news-service';
import { getTournament } from '@/server/services/tournament-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.news' });
  return { title: t('title'), robots: { index: false } };
}

/** Organisers: news for a tournament page, optionally emailed to all participants (D62). */
export default async function NewsPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const news = await listNews(actor, id);
  const t = await getTranslations('Admin');
  const tn = await getTranslations('Admin.news');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const text = (v: unknown) => {
    const o = (v ?? {}) as { nl?: string; en?: string };
    return (locale === 'en' && o.en) || o.nl || '';
  };

  return (
    <>
      <PageHeader
        title={tn('heading', { tournament: tournament.name })}
        intro={tn('intro')}
        actions={
          <Button asChild variant="outline">
            <Link href={`/admin/tournaments/${id}`}>{t('back')}</Link>
          </Button>
        }
      />
      <StatusNotice status={firstParam((await searchParams).status)} />

      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{tn('new')}</h2>
        <NewsForm locale={locale} tournamentId={id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tn('list')}</h2>
        {news.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tn('empty')}</p>
        ) : (
          <ul className="space-y-3">
            {news.map((n) => (
              <li key={n.id} className="space-y-2 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{text(n.title)}</h3>
                  <span className="text-xs text-muted-foreground">
                    {n.publishedAt ? tn('publishedAt', { date: when(n.publishedAt) }) : tn('draft')}
                    {n.emailSentAt && <> · {tn('emailedAt', { date: when(n.emailSentAt) })}</>}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line text-muted-foreground">{text(n.body)}</p>
                <div className="flex flex-wrap gap-2">
                  <form action={publishNewsAction.bind(null, locale, id, n.id, !n.publishedAt)}>
                    <Button type="submit" size="sm" variant="outline">
                      {n.publishedAt ? tn('unpublish') : tn('publish')}
                    </Button>
                  </form>
                  {n.publishedAt && !n.emailSentAt && (
                    <form action={emailNewsAction.bind(null, locale, id, n.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        {tn('email')}
                      </Button>
                    </form>
                  )}
                  <form action={deleteNewsAction.bind(null, locale, id, n.id)}>
                    <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                      {tn('delete')}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
