import { formatEuro } from '@tourneasy/shared';
import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BuyBundle } from '@/components/public/buy-bundle';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { cn } from '@/lib/utils';
import { getActor } from '@/server/auth/web';
import { publicPricing, VAT_PERCENT } from '@/server/services/pricing-service';

type Props = { params: Promise<{ locale: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Pricing' });
  return { title: t('title') };
}

/** Packages for organisers (D87). Only there while the owner has switched pricing on. */
export default async function PricingPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const actor = await getActor();
  const pricing = await publicPricing(actor);
  if (!pricing) notFound();
  const status = firstParam((await searchParams).status);
  const t = await getTranslations('Pricing');
  const tp = await getTranslations('Packages');
  const te = await getTranslations('Errors');
  const organiser = !!actor?.roles.some((r) => r === 'ORGANISER' || r === 'ADMIN');
  const euro = (c: number) => formatEuro(c, locale);

  return (
    <>
      <PageHero title={t('title')} intro={t('intro')} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:py-10">
        {status === 'packagePaid' && (
          <p role="status" className="rounded-md border bg-secondary px-4 py-3 text-sm">
            {t('paid')}
          </p>
        )}
        {status === 'packageRequested' && (
          <p role="status" className="rounded-md border bg-secondary px-4 py-3 text-sm">
            {t('requested')}
          </p>
        )}
        {status === 'notPaid' && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 px-4 py-3 text-sm text-destructive"
          >
            {te('notPaid')}
          </p>
        )}
        {pricing.discount && (
          <p className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            {t('discount', { percent: pricing.discount.percent, club: pricing.discount.clubName })}
          </p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pricing.plans.map((p) => {
            const features = (tp.raw(`${p.key}.features`) as string[]) ?? [];
            const highlight = p.key === 'PRO';
            return (
              <li
                key={p.key}
                className={cn(
                  'flex flex-col gap-4 rounded-lg border bg-card p-5',
                  highlight && 'border-primary ring-1 ring-primary',
                )}
              >
                <div>
                  <h2 className="text-lg font-semibold">{tp(`${p.key}.name` as 'FREE.name')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {tp(`${p.key}.unit` as 'FREE.unit')}
                  </p>
                </div>
                <div>
                  {p.quote.discountCents > 0 && (
                    <span className="mr-2 text-sm text-muted-foreground line-through">
                      {euro(p.priceCents)}
                    </span>
                  )}
                  <span className="text-3xl font-bold tabular-nums">
                    {p.priceCents === 0 ? t('free') : euro(p.quote.netCents)}
                  </span>
                  {p.priceCents > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('exVat', { vat: VAT_PERCENT, total: euro(p.quote.totalCents) })}
                    </p>
                  )}
                </div>
                <ul className="flex-1 space-y-1.5 text-sm">
                  {p.maxPlayers !== null && (
                    <li className="flex gap-2">
                      <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      {t('upTo', { count: p.maxPlayers })}
                    </li>
                  )}
                  {features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.key === 'BUNDLE' && organiser ? (
                  <BuyBundle
                    label={
                      pricing.onlinePayment
                        ? t('buy', { total: euro(p.quote.totalCents) })
                        : t('requestInvoice')
                    }
                  />
                ) : p.key === 'CLUB' ? (
                  <p className="text-sm text-muted-foreground">{t('contact')}</p>
                ) : organiser ? (
                  <p className="text-sm text-muted-foreground">{t('pickInTournament')}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <section className="space-y-2 text-sm text-muted-foreground">
          <p>{t('howItWorks')}</p>
          {!organiser && (
            <Button asChild variant="outline">
              <Link
                href={actor ? '/admin' : `/login?next=${encodeURIComponent(`/${locale}/pricing`)}`}
              >
                {actor ? t('toPortal') : t('login')}
              </Link>
            </Button>
          )}
        </section>
      </div>
    </>
  );
}
