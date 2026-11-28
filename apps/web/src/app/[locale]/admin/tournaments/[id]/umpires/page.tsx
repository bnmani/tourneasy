import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { AddUmpireForm, ResetUmpireForm } from '@/components/admin/umpire-forms';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requirePortal } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { getTournament } from '@/server/services/tournament-service';
import { listUmpires } from '@/server/services/umpire-admin';
import { revokeUmpireAction } from './actions';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.umpires' });
  return { title: t('title'), robots: { index: false } };
}

/** Organisers: umpire profiles for a tournament. A PIN and QR are shown once, on create or reset. */
export default async function UmpiresPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const tournament = await getTournament(actor, id).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!tournament) notFound();
  const umpires = await listUmpires(actor, id);
  const t = await getTranslations('Admin.umpires');
  const format = await getFormatter();

  return (
    <>
      <PageHeader title={t('heading', { tournament: tournament.name })} intro={t('intro')} />
      <StatusNotice status={firstParam((await searchParams).status)} />

      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('new')}</h2>
        <AddUmpireForm locale={locale} tournamentId={id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('list')}</h2>
        {umpires.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="space-y-3">
            {umpires.map((u) => (
              <li key={u.id} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{u.displayName}</h3>
                  <span className="text-xs text-muted-foreground">
                    {t(`status_${u.status}`)} ·{' '}
                    {t('validUntil', {
                      date: format.dateTime(u.expiresAt, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                    {u.hasDevice && <> · {t('linked')}</>}
                  </span>
                </div>
                {u.status !== 'revoked' && (
                  <div className="flex flex-wrap items-start gap-2">
                    <ResetUmpireForm
                      locale={locale}
                      tournamentId={id}
                      umpireId={u.id}
                      displayName={u.displayName}
                    />
                    <form action={revokeUmpireAction.bind(null, locale, id, u.id)}>
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        {t('revoke')}
                      </Button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
