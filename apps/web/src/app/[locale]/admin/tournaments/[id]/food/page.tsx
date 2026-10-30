import { formatEuro, utcToAmsterdamLocal } from '@tourneasy/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FoodItemForm, FoodSettingsForm } from '@/components/admin/food-forms';
import { Badge, PageHeader, StatusNotice } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { firstParam, pageLocale, type SearchParams } from '@/lib/page';
import {
  markCollectedAction,
  refundFoodOrderAction,
  removeFoodItemAction,
} from '@/server/actions/pricing-food-actions';
import { requirePortal } from '@/server/auth/web';
import { ALLERGENS, foodOrders, foodSettings } from '@/server/services/food-service';

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'Food.admin' });
  return { title: t('title'), robots: { index: false } };
}

/** Organiser: the food & drink menu, its settings, and the orders to hand out (D87). */
export default async function FoodAdminPage({ params, searchParams }: Props) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const actor = await requirePortal(locale);
  const query = await searchParams;
  const settings = await foodSettings(actor, id);
  const t = await getTranslations('Food.admin');
  const ta = await getTranslations('Food.allergens');

  if (!settings.allowed)
    return (
      <>
        <PageHeader title={t('title')} />
        <p className="text-muted-foreground">{t('notAllowed')}</p>
      </>
    );

  const list = await foodOrders(actor, id);
  const q = (firstParam(query.q) ?? '').trim().toLowerCase();
  const orders = q
    ? list.orders.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.name.toLowerCase().includes(q) ||
          (o.memberNumber ?? '').toLowerCase().includes(q),
      )
    : list.orders;
  const euro = (c: number) => formatEuro(c, locale);

  return (
    <>
      <PageHeader
        title={t('title')}
        intro={t('intro')}
        actions={
          settings.foodOrderingOn ? (
            <Button asChild variant="outline">
              <Link href={`/tournaments/${settings.slug}/food`}>{t('playerView')}</Link>
            </Button>
          ) : undefined
        }
      />
      <StatusNotice status={firstParam(query.status)} />

      <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('settings')}</h2>
        <FoodSettingsForm
          locale={locale}
          tournamentId={id}
          values={{
            on: settings.foodOrderingOn,
            cutoffAt: settings.foodCutoffAt ? utcToAmsterdamLocal(settings.foodCutoffAt) : '',
            pickupInfo: settings.foodPickupInfo ?? '',
          }}
        />
      </section>

      <section id="menu" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t('menu')}</h2>
        {settings.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noItems')}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {settings.items.map((item) => (
              <li key={item.id} className="p-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="tabular-nums">{euro(item.priceCents)}</span>
                    {!item.active && <Badge tone="muted">{t('hidden')}</Badge>}
                    <span className="text-muted-foreground">
                      {item.maxQuantity === null
                        ? t('orderedNoLimit', { count: item.ordered })
                        : t('ordered', { count: item.ordered, max: item.maxQuantity })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.noAllergens
                        ? t('noAllergensShort')
                        : item.allergens.map((a) => ta(a as 'gluten')).join(', ')}
                    </span>
                    <span className="ml-auto text-xs text-primary underline">{t('edit')}</span>
                  </summary>
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <FoodItemForm
                      locale={locale}
                      tournamentId={id}
                      allergens={ALLERGENS}
                      item={{
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        priceCents: item.priceCents,
                        allergens: item.allergens,
                        noAllergens: item.noAllergens,
                        maxQuantity: item.maxQuantity,
                        active: item.active,
                      }}
                    />
                    <form action={removeFoodItemAction.bind(null, locale, id, item.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        {item.ordered > 0 ? t('hide') : t('remove')}
                      </Button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-md border p-3" open={settings.items.length === 0}>
          <summary className="cursor-pointer text-sm font-medium">{t('addItem')}</summary>
          <div className="mt-4">
            <FoodItemForm locale={locale} tournamentId={id} allergens={ALLERGENS} />
          </div>
        </details>
      </section>

      <section id="orders" className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('orders')}</h2>
          {list.orders.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/v1/admin/tournaments/${id}/food.xlsx?lang=${locale}`} download>
                {t('export')}
              </a>
            </Button>
          )}
        </div>
        {list.totals.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {list.totals.map((x) => (
              <span key={x.name} className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                <strong className="tabular-nums">{x.quantity}×</strong> {x.name}
                <span className="text-muted-foreground">
                  {' '}
                  · {t('collectedCount', { count: x.collected })}
                </span>
              </span>
            ))}
            <span className="rounded-md border px-3 py-1.5 text-sm">
              {t('revenue')}: <strong className="tabular-nums">{euro(list.revenueCents)}</strong>
            </span>
          </div>
        )}
        <form className="flex gap-2" action={`/${locale}/admin/tournaments/${id}/food#orders`}>
          <label htmlFor="food-search" className="sr-only">
            {t('search')}
          </label>
          <input
            id="food-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('searchPlaceholder')}
            className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-base sm:text-sm"
          />
          <Button type="submit" variant="outline">
            {t('search')}
          </Button>
        </form>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noOrders')}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-semibold">{o.orderNumber}</code>
                    <span className="font-medium">{o.name}</span>
                    {o.memberNumber && (
                      <span className="text-muted-foreground">{o.memberNumber}</span>
                    )}
                    <Badge tone={o.status === 'PAID' ? 'primary' : 'muted'}>
                      {o.status === 'PAID' ? t('paid') : o.online ? t('paying') : t('payAtPickup')}
                    </Badge>
                    {o.collectedAt && <Badge tone="muted">{t('collected')}</Badge>}
                  </div>
                  <p className="text-muted-foreground">
                    {o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')} ·{' '}
                    {euro(o.totalCents)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!o.collectedAt && (o.status === 'PAID' || !o.online) && (
                    <form action={markCollectedAction.bind(null, locale, id, o.id)}>
                      <Button type="submit" size="sm">
                        {o.status === 'PAID' ? t('handOut') : t('handOutPaid')}
                      </Button>
                    </form>
                  )}
                  {!o.collectedAt && (o.status === 'PAID' ? o.online : !o.online) && (
                    <form action={refundFoodOrderAction.bind(null, locale, id, o.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        {o.status === 'PAID' ? t('refund') : t('cancelOrder')}
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
