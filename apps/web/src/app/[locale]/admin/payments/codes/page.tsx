import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { DiscountCodeForm } from '@/components/admin/discount-code-form';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { formatEuro } from '@tourneasy/shared';
import { setDiscountCodeActiveAction } from '@/server/actions/payment-actions';
import { requireRole } from '@/server/auth/web';
import { listDiscountCodes } from '@/server/services/entry-discount-service';
import { paymentTournamentOptions } from '@/server/services/payment-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.codes' });
  return { title: t('title'), robots: { index: false } };
}

/** Owner: entry fee discount codes (D111). */
export default async function DiscountCodesPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'OWNER');
  const query = await searchParams;
  const [codes, tournaments] = await Promise.all([
    listDiscountCodes(actor),
    paymentTournamentOptions(actor),
  ]);
  const t = await getTranslations('Admin.codes');
  const format = await getFormatter();
  const euro = (c: number) => formatEuro(c, locale);
  return (
    <>
      <PageHeader
        title={t('title')}
        intro={t('intro')}
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/payments">{t('back')}</Link>
          </Button>
        }
      />
      <StatusNotice status={firstParam(query.status)} />
      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('new')}</h2>
        <DiscountCodeForm locale={locale} tournaments={tournaments} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('list', { count: codes.length })}</h2>
        {codes.length === 0 ? (
          <p className="text-muted-foreground">{t('none')}</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {codes.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="flex flex-wrap items-center gap-2">
                    <code className="font-semibold">{c.code}</code>
                    <span>{t('percentOff', { percent: c.percent })}</span>
                    <Badge tone={c.active ? 'primary' : 'muted'}>
                      {c.active ? t('on') : t('off')}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.tournament?.name ?? t('allTournaments')} ·{' '}
                    {c.maxUses === null
                      ? t('usesNoLimit', { count: c.uses })
                      : t('uses', { count: c.uses, max: c.maxUses })}{' '}
                    · {t('given', { amount: euro(c.discountCents) })}
                    {c.validUntil && (
                      <>
                        {' '}
                        ·{' '}
                        {t('until', {
                          date: format.dateTime(c.validUntil, {
                            dateStyle: 'medium',
                            timeZone: 'UTC',
                          }),
                        })}
                      </>
                    )}
                    {c.note && <> · {c.note}</>}
                  </p>
                </div>
                <form action={setDiscountCodeActiveAction.bind(null, locale, c.id, !c.active)}>
                  <Button type="submit" size="sm" variant="outline">
                    {c.active ? t('switchOff') : t('switchOn')}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
