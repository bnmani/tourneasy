import { apiHandler } from '@/server/lib/api';
import { handleWebhook } from '@/server/services/payment-service';

/**
 * POST /api/v1/payments/webhook — Stripe events (payment_intent.*, refund.*). The signature is
 * checked against STRIPE_WEBHOOK_SECRET on the raw body; each event is applied once.
 */
export const POST = apiHandler(async (request) => {
  const signature = request.headers.get('stripe-signature') ?? '';
  const result = await handleWebhook(await request.text(), signature);
  return Response.json({ received: true, ...result });
});
