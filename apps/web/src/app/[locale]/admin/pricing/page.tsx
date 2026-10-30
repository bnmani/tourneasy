import { formatDate, formatEuro } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClubDiscountForm, PricingForm } from '@/components/admin/pricing-forms';
import { PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { requireRole } from '@/server/auth/web';
import {
  cancelPurchaseAction,
  markPurchasePaidAction,
  removeClubDiscountAction,
} from '@/server/actions/pricing-food-actions';
import {
  discountClubOptions,
  getPricing,
  listClubDiscounts,
  listPurchases,
} from '@/server/services/pricing-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Admin.pricing' });
  return { title: t('title'), robots: { index: false } };
}

/** Owner: packages and prices, club discounts, purchases and invoices (D87). */
export default async function PricingAdminPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await requireRole(locale, 'OWNER');
  const query = await searchParams;
  const [settings, discounts, purchases, clubs] = await Promise.all([
    getPricing(),
    listClubDiscounts(actor),
    listPurchases(actor),
    discountClubOptions(actor),
  ]);
  const t = await getTranslations('Admin.pricing');
  const tp = await getTranslations('Packages');

  return (
    <>
      <PageHeader title={t('title')} intro={t('intro')} />
      <StatusNotice status={firstParam(query.status)} />
      {!settings.enabled && (
        <p className="rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm">
          {t('offNotice')}
        </p>
      )}
      <PricingForm
        locale={locale}
        values={{
          enabled: settings.enabled,
          onlinePayment: settings.onlinePayment,
          plans: settings.plans,
          company: settings.company,
        }}
      />

      <section id="discounts" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('discounts')}</h2>
        <p className="text-sm text-muted-foreground">{t('discountsHint')}</p>
        {discounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noDiscounts')}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {discounts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                <span className="font-medium">{d.club.name}</span>
                <span>{d.percent}%</span>
                {d.code && <code className="rounded bg-muted px-1.5">{d.code}</code>}
                <span className="text-muted-foreground">
                  {d.validUntil
                    ? t('until', { date: formatDate(d.validUntil, locale) })
                    : t('noEnd')}
                </span>
                {d.note && <span className="text-muted-foreground">{d.note}</span>}
                <form
                  action={removeClubDiscountAction.bind(null, locale, d.id)}
                  className="ml-auto"
                >
                  <Button type="submit" variant="outline" size="sm">
                    {t('remove')}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ClubDiscountForm locale={locale} clubs={clubs} />
      </section>

      <section id="purchases" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('purchases')}</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPurchases')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-3">{t('date')}</th>
                  <th className="py-2 pr-3">{t('buyer')}</th>
                  <th className="py-2 pr-3">{t('package')}</th>
                  <th className="py-2 pr-3 text-right">{t('total')}</th>
                  <th className="py-2 pr-3">{t('purchaseStatus')}</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {purchases.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatDate(p.createdAt, locale)}
                    </td>
                    <td className="py-2 pr-3">
                      {p.user.name}
                      <div className="text-xs text-muted-foreground">{p.user.email}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {tp(`${p.packageKey}.name` as 'FREE.name')}
                      {p.tournament && (
                        <div className="text-xs text-muted-foreground">{p.tournament.name}</div>
                      )}
                      {p.discountPercent > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t('discountApplied', { percent: p.discountPercent })}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                      {formatEuro(p.totalCents, locale)}
                    </td>
                    <td className="py-2 pr-3">
                      {t(`statuses.${p.status}` as 'statuses.PAID')}
                      {p.invoiceNumber && (
                        <div className="text-xs text-muted-foreground">{p.invoiceNumber}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {p.status === 'PAID' && (
                          <Button asChild variant="outline" size="sm">
                            <a href={`/api/v1/me/invoices/${p.id}?locale=${locale}`}>
                              {t('invoice')}
                            </a>
                          </Button>
                        )}
                        {(p.status === 'REQUESTED' || p.status === 'PENDING') && (
                          <>
                            <form action={markPurchasePaidAction.bind(null, locale, p.id)}>
                              <Button type="submit" size="sm">
                                {t('markPaid')}
                              </Button>
                            </form>
                            <form action={cancelPurchaseAction.bind(null, locale, p.id)}>
                              <Button type="submit" variant="outline" size="sm">
                                {t('cancel')}
                              </Button>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
