import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { moderateFromInboxAction } from '@/server/actions/feedback-actions';
import { requirePortal } from '@/server/auth/web';
import { listInbox } from '@/server/services/feedback-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

const TABS = ['new', 'published', 'private', 'rejected'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Feedback' });
  return { title: t('inbox.title'), robots: { index: false } };
}

/** Organisers and admins: every player comment in one list, with the choice of where it shows. */
export default async function FeedbackInboxPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requirePortal(locale);
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(firstParam(sp.tab) ?? '')
    ? (firstParam(sp.tab) as Tab)
    : 'new';
  const tournamentId = /^[0-9a-f-]{36}$/.test(firstParam(sp.tournament) ?? '')
    ? (firstParam(sp.tournament) as string)
    : '';
  const { rows, tabCounts, tournaments, received } = await listInbox(actor, {
    tab,
    tournamentId: tournamentId || undefined,
  });
  const t = await getTranslations('Feedback');
  const ti = await getTranslations('Feedback.inbox');
  const format = await getFormatter();
  const when = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const tabLabel: Record<Tab, string> = {
    new: ti('tabNew'),
    published: ti('tabPublished'),
    private: ti('tabPrivate'),
    rejected: ti('tabRejected'),
  };
  const tabHref = (next: Tab) =>
    `/admin/feedback?tab=${next}${tournamentId ? `&tournament=${tournamentId}` : ''}`;

  return (
    <>
      <PageHeader title={ti('title')} intro={ti('intro')} />
      <StatusNotice status={firstParam(sp.status)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={ti('title')} className="flex flex-wrap gap-2">
          {TABS.map((k) => (
            <Link
              key={k}
              href={tabHref(k)}
              aria-current={tab === k ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'
              }`}
            >
              {tabLabel[k]} <span className="tabular-nums opacity-80">{tabCounts[k]}</span>
            </Link>
          ))}
        </nav>
        <form action="/admin/feedback" method="get" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <select
            name="tournament"
            defaultValue={tournamentId}
            aria-label={ti('allTournaments')}
            className="h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{ti('allTournaments')}</option>
            {tournaments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline">
            OK
          </Button>
        </form>
      </div>

      {received._count._all > 0 && (
        <p className="text-sm text-muted-foreground">
          {ti('received', {
            average: (received._avg.rating ?? 0).toFixed(1),
            count: received._count._all,
          })}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {received._count._all === 0 ? ti('none') : ti('empty')}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const act = (status: 'TOURNAMENT' | 'WEBSITE' | 'PRIVATE' | 'REJECTED') =>
              moderateFromInboxAction.bind(null, locale, row.id, status, tab, tournamentId);
            return (
              <li key={row.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{row.firstName}</p>
                    <p className="text-xs text-muted-foreground">{when(row.createdAt)}</p>
                  </div>
                  <p
                    className="shrink-0 text-amber-600"
                    aria-label={t('outOf', { rating: row.rating })}
                  >
                    {'★'.repeat(row.rating)}
                    <span className="text-muted-foreground/40">{'★'.repeat(5 - row.rating)}</span>
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{row.tournament.name}</p>
                <p className="text-sm whitespace-pre-line">{row.comment}</p>
                <p
                  className={`w-fit rounded-full px-2 py-0.5 text-xs ${
                    row.shareConsent ? 'bg-muted' : 'text-muted-foreground'
                  }`}
                >
                  {row.shareConsent ? ti('consent') : ti('noConsent')}
                </p>
                <div className="grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4">
                  {(
                    [
                      ['TOURNAMENT', ti('toTournament'), !row.shareConsent],
                      ['WEBSITE', ti('toWebsite'), !row.shareConsent],
                      ['PRIVATE', ti('private'), false],
                      ['REJECTED', ti('reject'), false],
                    ] as const
                  ).map(([status, label, disabled]) => (
                    <form key={status} action={act(status)} className="contents">
                      <Button
                        type="submit"
                        size="sm"
                        className="w-full"
                        variant={row.status === status ? 'default' : 'outline'}
                        aria-pressed={row.status === status}
                        disabled={disabled}
                      >
                        {label}
                      </Button>
                    </form>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{ti('note')}</p>
    </>
  );
}
