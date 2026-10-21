import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { reconcileOrder } from '@/server/services/payment-service';

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/me/orders/{id} — current status, checked with Stripe (after the payment sheet). */
export const GET = apiHandler(async (request, { params }: Context) => {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'not found' }, { status: 404 });
  return json(await reconcileOrder(id, await requireApiActor(request)));
});
