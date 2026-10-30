import { redirect } from 'next/navigation';
import { firstParam, pageLocale, type LocaleParams, type SearchParams } from '@/lib/page';
import { requireActor } from '@/server/auth/web';
import { reconcileFoodOrder } from '@/server/services/food-service';
import { reconcilePurchase } from '@/server/services/pricing-service';

export const dynamic = 'force-dynamic';

/**
 * Where Stripe sends people back after paying for a package or a food order (D87): checks the
 * payment and moves on to the page it belongs to, with the outcome.
 */
export default async function PaymentDonePage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const kind = firstParam(query.kind);
  const id = firstParam(query.id) ?? '';
  const actor = await requireActor(locale, `/${locale}/payments/done?kind=${kind}&id=${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(`/${locale}`);
  if (kind === 'food') {
    const r = await reconcileFoodOrder(actor, id).catch(() => null);
    if (!r) redirect(`/${locale}/account`);
    redirect(
      `/${locale}/tournaments/${r.slug}/food?status=${r.status === 'PAID' ? 'paid' : 'notPaid'}`,
    );
  }
  const r = await reconcilePurchase(actor, id).catch(() => null);
  if (!r) redirect(`/${locale}/admin`);
  const status = r.status === 'PAID' ? 'packagePaid' : 'notPaid';
  redirect(
    r.tournamentId
      ? `/${locale}/admin/tournaments/${r.tournamentId}?status=${status}#package`
      : `/${locale}/pricing?status=${status}`,
  );
}
