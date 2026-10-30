'use server';

/** Pricing (owner settings, buying packages) and food ordering (D87). */
import { amsterdamLocalToUtc } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/forms/form-state';
import { currentRequestMeta, getActor } from '../auth/web';
import { AppError, isAppError, type ErrorCode } from '../lib/errors';
import { withStatus } from '../lib/urls';
import {
  type FoodCheckout,
  markCollected,
  placeFoodOrder,
  refundFoodOrder,
  removeFoodItem,
  saveFoodItem,
  saveFoodSettings,
  setFoodAccess,
} from '../services/food-service';
import {
  type BuyResult,
  buyPackage,
  ownerCancelPurchase,
  ownerMarkPaid,
  PACKAGES,
  removeClubDiscount,
  saveClubDiscount,
  savePricing,
  applyBundleCredit,
} from '../services/pricing-service';
import { formToObject, toFormState } from './form-utils';

async function actorOrThrow() {
  const actor = await getActor();
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** Runs `work`, then back to `target` with ?status=ok or the error code. */
async function act(target: string, ok: string, work: () => Promise<unknown>) {
  let status = ok;
  try {
    await work();
  } catch (error) {
    status = isAppError(error) ? error.code : 'unexpected';
    if (!isAppError(error)) console.error('[pricing/food action] failed', error);
  }
  revalidatePath('/', 'layout');
  redirect(withStatus(target, status));
}

// ── Owner: pricing ─────────────────────────────────────────────────────────────────

export async function savePricingAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const get = (k: string) => String(formData.get(k) ?? '');
  try {
    await savePricing(
      await actorOrThrow(),
      {
        enabled: formData.get('enabled') === 'on',
        onlinePayment: formData.get('onlinePayment') === 'on',
        plans: PACKAGES.map((key) => ({
          key,
          price: get(`${key}.price`),
          maxPlayers: get(`${key}.maxPlayers`),
          visible: formData.get(`${key}.visible`) === 'on',
          ...(key === 'BUNDLE' ? { credits: Number(get('BUNDLE.credits') || 5) } : {}),
        })),
        company: {
          name: get('company.name'),
          address: get('company.address'),
          kvk: get('company.kvk'),
          vatNumber: get('company.vatNumber'),
          email: get('company.email'),
          iban: get('company.iban'),
        },
      },
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/admin/pricing?status=saved`);
}

export async function saveClubDiscountAction(
  locale: AppLocale,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await saveClubDiscount(
      await actorOrThrow(),
      formToObject(formData),
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`/${locale}/admin/pricing?status=saved#discounts`);
}

export async function removeClubDiscountAction(locale: AppLocale, id: string) {
  await act(`/${locale}/admin/pricing#discounts`, 'deleted', async () =>
    removeClubDiscount(await actorOrThrow(), id, await currentRequestMeta()),
  );
}

export async function markPurchasePaidAction(locale: AppLocale, id: string) {
  await act(`/${locale}/admin/pricing#purchases`, 'saved', async () =>
    ownerMarkPaid(await actorOrThrow(), id, await currentRequestMeta()),
  );
}

export async function cancelPurchaseAction(locale: AppLocale, id: string) {
  await act(`/${locale}/admin/pricing#purchases`, 'saved', async () =>
    ownerCancelPurchase(await actorOrThrow(), id, await currentRequestMeta()),
  );
}

// ── Organisers: packages ───────────────────────────────────────────────────────────

export type BuyActionResult = ({ ok: true } & BuyResult) | { ok: false; error: ErrorCode };

/** Picks or buys a package; the client opens the payment window when there is one. */
export async function buyPackageAction(input: {
  packageKey: string;
  tournamentId?: string;
  code?: string;
}): Promise<BuyActionResult> {
  try {
    const result = await buyPackage(await actorOrThrow(), input, await currentRequestMeta());
    if (result.kind !== 'pay') revalidatePath('/', 'layout');
    return { ok: true, ...result };
  } catch (error) {
    if (!isAppError(error)) console.error('[pricing action] buy failed', error);
    return { ok: false, error: isAppError(error) ? error.code : 'unexpected' };
  }
}

export async function applyBundleCreditAction(locale: AppLocale, tournamentId: string) {
  await act(`/${locale}/admin/tournaments/${tournamentId}#package`, 'saved', async () =>
    applyBundleCredit(await actorOrThrow(), tournamentId, await currentRequestMeta()),
  );
}

// ── Owner: food per tournament ──────────────────────────────────────────────────────

export async function setFoodAccessAction(
  locale: AppLocale,
  tournamentId: string,
  enabled: boolean,
) {
  await act(`/${locale}/admin/tournaments/${tournamentId}#food-access`, 'saved', async () =>
    setFoodAccess(await actorOrThrow(), tournamentId, enabled, await currentRequestMeta()),
  );
}

// ── Organisers: menu and orders ─────────────────────────────────────────────────────

const foodPath = (locale: AppLocale, id: string) => `/${locale}/admin/tournaments/${id}/food`;

export async function saveFoodSettingsAction(
  locale: AppLocale,
  tournamentId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await saveFoodSettings(
      await actorOrThrow(),
      tournamentId,
      {
        on: formData.get('on') === 'on',
        cutoffAt: String(formData.get('cutoffAt') ?? ''),
        pickupInfo: String(formData.get('pickupInfo') ?? ''),
      },
      await currentRequestMeta(),
      amsterdamLocalToUtc,
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`${foodPath(locale, tournamentId)}?status=saved`);
}

export async function saveFoodItemAction(
  locale: AppLocale,
  tournamentId: string,
  itemId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await saveFoodItem(
      await actorOrThrow(),
      tournamentId,
      itemId,
      {
        ...formToObject(formData, { booleans: ['noAllergens', 'active'], arrays: ['allergens'] }),
        // A new item is on the menu straight away.
        ...(itemId ? {} : { active: true }),
      },
      await currentRequestMeta(),
    );
  } catch (error) {
    return toFormState(error, formData);
  }
  revalidatePath('/', 'layout');
  redirect(`${foodPath(locale, tournamentId)}?status=saved#menu`);
}

export async function removeFoodItemAction(
  locale: AppLocale,
  tournamentId: string,
  itemId: string,
) {
  await act(`${foodPath(locale, tournamentId)}#menu`, 'deleted', async () =>
    removeFoodItem(await actorOrThrow(), tournamentId, itemId, await currentRequestMeta()),
  );
}

export async function markCollectedAction(
  locale: AppLocale,
  tournamentId: string,
  orderId: string,
) {
  await act(`${foodPath(locale, tournamentId)}#orders`, 'saved', async () =>
    markCollected(await actorOrThrow(), tournamentId, orderId, await currentRequestMeta()),
  );
}

export async function refundFoodOrderAction(
  locale: AppLocale,
  tournamentId: string,
  orderId: string,
) {
  await act(`${foodPath(locale, tournamentId)}#orders`, 'refunded', async () =>
    refundFoodOrder(await actorOrThrow(), tournamentId, orderId, await currentRequestMeta()),
  );
}

// ── Players ─────────────────────────────────────────────────────────────────────────

export type FoodActionResult = ({ ok: true } & FoodCheckout) | { ok: false; error: ErrorCode };

export async function placeFoodOrderAction(
  slug: string,
  lines: { itemId: string; quantity: number }[],
): Promise<FoodActionResult> {
  try {
    const result = await placeFoodOrder(
      await actorOrThrow(),
      slug,
      { lines },
      await currentRequestMeta(),
    );
    if (result.kind === 'placed') revalidatePath('/', 'layout');
    return { ok: true, ...result };
  } catch (error) {
    if (!isAppError(error)) console.error('[food action] order failed', error);
    return { ok: false, error: isAppError(error) ? error.code : 'unexpected' };
  }
}
