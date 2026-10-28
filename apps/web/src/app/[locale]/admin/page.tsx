import { needsAttention } from '@/server/services/progress-service';
import { auditLabel } from '@/lib/labels';
import { TOURNAMENT_STATUSES } from '@tourneasy/shared/schemas';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, PageHeader } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { getActor, isPortalUser, requirePortal } from '@/server/auth/web';
import { getDashboard } from '@/server/services/admin-service';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  // Metadata renders alongside the layout's role check: don't reveal admin titles to others.
  if (!isPortalUser(await getActor())) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: 'Admin' });
  return { title: t('portal'), robots: { index: false } };
}

export default async function AdminDashboardPage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const actor = await requirePortal(locale);
  const [data, attention] = await Promise.all([getDashboard(actor), needsAttention(actor)]);
  const t = await getTranslations('Admin');
  const ts = await getTranslations('TournamentStatuses');
  const ta = await getTranslations('AuditActions');
  const format = await getFormatter();
  const isAdmin = actor.roles.includes('ADMIN');

  const stats = [
    { label: t('dashboard.players'), value: data.players, href: '/admin/players' },
    { label: t('dashboard.accounts'), value: data.accounts, href: '/admin/users' },
    { label: t('dashboard.venues'), value: data.venues, href: '/admin/venues' },
    { label: t('dashboard.clubs'), value: data.clubs, href: '/admin/clubs' },
  ].filter((s) => s.value !== null);

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        intro={isAdmin ? undefined : t('dashboard.organiserIntro')}
        actions={
          isAdmin && (
            <Button asChild>
              <Link href="/admin/tournaments/new">{t('tournaments.new')}</Link>
            </Button>
          )
        }
      />

      <section aria-labelledby="attention-title" className="space-y-2">
        <h2 id="attention-title" className="font-semibold">
          {t('attention.title')}
        </h2>
        {attention.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            {t('attention.none')}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border border-amber-500/50 bg-amber-500/5">
            {attention.map((a) => (
              <li key={`${a.tournamentId}-${a.key}`}>
                <Link
                  href={a.href}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span>
                    <span className="font-medium">
                      {t(`attention.${a.key}`, { count: a.count })}
                    </span>
                    <span className="text-muted-foreground"> · {a.tournament}</span>
                  </span>
                  <span aria-hidden="true" className="font-semibold text-primary">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stats.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block rounded-lg border bg-card p-4 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="block text-sm text-muted-foreground">{s.label}</span>
                <span className="mt-1 block text-2xl font-bold">{s.value}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">{t('dashboard.byStatus')}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {TOURNAMENT_STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={`/admin/tournaments?status=${s}`}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:border-primary"
              >
                {ts(s)} <Badge>{data.tournamentsByStatus[s] ?? 0}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="font-semibold">{t('dashboard.upcoming')}</h2>
          {data.upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>
          ) : (
            <ul className="mt-3 divide-y">
              {data.upcoming.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/tournaments/${u.id}`}
                      className="font-medium hover:underline"
                    >
                      {u.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {format.dateTimeRange(u.startsOn, u.endsOn, {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      })}
                      {u.venue?.city && ` · ${u.venue.city}`}
                    </p>
                  </div>
                  <Badge>{ts(u.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {actor.roles.includes('OWNER') && (
          <section className="rounded-lg border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('dashboard.recent')}</h2>
              <Link href="/admin/audit" className="text-sm text-primary hover:underline">
                {t('dashboard.viewAll')}
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.noActivity')}</p>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 py-2">
                    <span>{auditLabel(ta, r.action)}</span>
                    <span className="text-muted-foreground">
                      {r.actor?.name ?? t('audit.system')} · {format.relativeTime(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
