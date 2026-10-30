import { formatDate, formatEuro, formatTime } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FoodOrder } from '@/components/public/food-order';
import { PageHero } from '@/components/public/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import { getActor } from '@/server/auth/web';
import { isAppError } from '@/server/lib/errors';
import { foodMenu } from '@/server/services/food-service';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Food.player' });
  return { title: t('title'), robots: { index: false } };
}

/** Player: order food and drink for the tournament day, and show the pickup code (D87). */
export default async function FoodPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { slug } = await params;
  const actor = await getActor();
  const menu = await foodMenu(actor, slug).catch((e) => {
    if (isAppError(e) && e.code === 'notFound') return null;
    throw e;
  });
  if (!menu) notFound();
  const status = firstParam((await searchParams).status);
  const t = await getTranslations('Food.player');
  const te = await getTranslations('Errors');
  const euro = (c: number) => formatEuro(c, locale);
  const cutoff = menu.tournament.foodCutoffAt;

  return (
    <>
      <PageHero
        title={t('title')}
        intro={
          <>
            {menu.tournament.name}
            {cutoff && (
              <>
                {' · '}
                {t('orderBy', {
                  date: formatDate(cutoff, locale),
                  time: formatTime(cutoff, locale),
                })}
              </>
            )}
          </>
        }
      >
        <Link href={`/tournaments/${slug}`} className="text-sm underline-offset-4 hover:underline">
          ← {t('back')}
        </Link>
      </PageHero>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {(status === 'placed' || status === 'paid') && (
          <p role="status" className="rounded-md border bg-secondary px-4 py-3 text-sm">
            {status === 'paid' ? t('paidDone') : t('placedDone')}
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
        {menu.tournament.foodPickupInfo && (
          <p className="text-sm">
            <strong>{t('pickup')}:</strong> {menu.tournament.foodPickupInfo}
          </p>
        )}

        {!menu.open ? (
          <p className="text-muted-foreground">{t('closed')}</p>
        ) : !actor ? (
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(`/${locale}/tournaments/${slug}/food`)}`}>
              {t('login')}
            </Link>
          </Button>
        ) : !menu.canOrder ? (
          <p className="text-muted-foreground">{t('onlyPlayers')}</p>
        ) : menu.items.length === 0 ? (
          <p className="text-muted-foreground">{t('empty')}</p>
        ) : (
          <FoodOrder
            slug={slug}
            items={menu.items.map((i) => ({
              id: i.id,
              name: i.name,
              description: i.description,
              priceCents: i.priceCents,
              allergens: i.allergens,
              noAllergens: i.noAllergens,
              left: i.left,
            }))}
          />
        )}
        <p className="text-xs text-muted-foreground">{t('allergyNote')}</p>

        {menu.orders.length > 0 && (
          <section id="orders" className="space-y-3">
            <h2 className="text-lg font-semibold">{t('myOrders')}</h2>
            <ul className="space-y-3">
              {menu.orders.map((o) => (
                <li key={o.id} className="flex gap-4 rounded-lg border bg-card p-4">
                  <div
                    className="size-28 shrink-0 rounded bg-white p-1"
                    role="img"
                    aria-label={t('qr', { number: o.orderNumber })}
                    // Our own QR code, made on the server from the order number.
                    dangerouslySetInnerHTML={{ __html: o.qrSvg }}
                  />
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-mono text-base font-semibold">{o.orderNumber}</p>
                    <p>{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</p>
                    <p>
                      {euro(o.totalCents)} ·{' '}
                      {o.status === 'PAID'
                        ? t('statusPaid')
                        : o.stripePaymentIntentId
                          ? t('statusPaying')
                          : t('statusPayAtPickup')}
                    </p>
                    {o.collectedAt && <p className="text-muted-foreground">{t('collected')}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t('showCode')}</p>
          </section>
        )}
      </div>
    </>
  );
}
