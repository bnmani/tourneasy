import { apiHandler, json, readJson, requireApiActor } from '@/server/lib/api';
import { createCheckout } from '@/server/services/payment-service';

/**
 * POST /api/v1/me/orders — { participantIds } → an order and the Stripe client secret for the
 * Payment Element (web) or Payment Sheet (mobile). Reuses an open order for the same shares.
 * `clientSecret` is null when a discount covers everything (the entries are then confirmed).
 */
export const POST = apiHandler(async (request) => {
  const result = await createCheckout(await requireApiActor(request), await readJson(request));
  return json(result, { status: 201 });
});
