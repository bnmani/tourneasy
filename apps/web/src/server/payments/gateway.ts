/**
 * Payment provider boundary (D51). The service layer talks to this interface only; production
 * uses Stripe PaymentIntents (iDEAL first, plus card/Bancontact when enabled in the Stripe
 * dashboard), tests use the in-memory fake below. The keys come from Admin → Betalingen →
 * Stripe-instellingen (encrypted in the database, D54), else from STRIPE_* environment variables.
 * Without keys there is no gateway and entries behave as in Phase 4 (shares paid at the desk).
 */
import { prisma } from '@tourneasy/db';
import Stripe from 'stripe';
import { decryptSecret } from '../lib/secret-box';

export type IntentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'canceled' | 'failed';
export type IntentMethod = 'IDEAL' | 'CARD' | 'BANCONTACT' | 'OTHER';

export type GatewayIntent = {
  id: string;
  clientSecret: string | null;
  status: IntentStatus;
  amountCents: number;
  method: IntentMethod | null;
  lastError: string | null;
};

export type GatewayRefund = { id: string; status: 'pending' | 'succeeded' | 'failed' };

/** The parts of a webhook event the service needs, independent of the SDK types. */
export type GatewayEvent = {
  id: string;
  type: string;
  intent?: GatewayIntent;
  refund?: GatewayRefund & { paymentIntentId: string | null };
  raw: unknown;
};

export interface PaymentGateway {
  /** Publishable key handed to the browser / mobile app to show the payment form. */
  readonly publishableKey: string;
  createIntent(input: {
    amountCents: number;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
    receiptEmail?: string;
  }): Promise<GatewayIntent>;
  retrieveIntent(id: string): Promise<GatewayIntent>;
  cancelIntent(id: string): Promise<void>;
  refund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<GatewayRefund>;
  /** Verifies the signature and parses the event; throws when the signature is wrong. */
  parseWebhook(rawBody: string, signature: string): GatewayEvent;
}

// ── Stripe ─────────────────────────────────────────────────────────────────────────

function mapStatus(status: Stripe.PaymentIntent.Status): IntentStatus {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'processing':
      return 'processing';
    case 'canceled':
      return 'canceled';
    default:
      return 'requires_payment';
  }
}

function mapMethod(intent: Stripe.PaymentIntent): IntentMethod | null {
  const charge = intent.latest_charge;
  const type =
    (typeof charge === 'object' && charge?.payment_method_details?.type) ||
    (typeof intent.payment_method === 'object' ? intent.payment_method?.type : undefined);
  if (!type) return null;
  if (type === 'ideal') return 'IDEAL';
  if (type === 'card') return 'CARD';
  if (type === 'bancontact') return 'BANCONTACT';
  return 'OTHER';
}

function toIntent(intent: Stripe.PaymentIntent): GatewayIntent {
  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: mapStatus(intent.status),
    amountCents: intent.amount,
    method: mapMethod(intent),
    lastError: intent.last_payment_error?.message ?? null,
  };
}

const refundStatus = (s: string | null): GatewayRefund['status'] =>
  s === 'succeeded' ? 'succeeded' : s === 'failed' || s === 'canceled' ? 'failed' : 'pending';

class StripeGateway implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    readonly publishableKey: string,
    private readonly webhookSecret: string | undefined,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, appInfo: { name: 'Tourneasy' } });
  }

  async createIntent(input: Parameters<PaymentGateway['createIntent']>[0]) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'eur',
        description: input.description,
        metadata: input.metadata,
        receipt_email: input.receiptEmail,
        // iDEAL, card, Bancontact … whatever is switched on in the Stripe dashboard.
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return toIntent(intent);
  }

  async retrieveIntent(id: string) {
    return toIntent(
      await this.stripe.paymentIntents.retrieve(id, {
        expand: ['latest_charge', 'payment_method'],
      }),
    );
  }

  async cancelIntent(id: string) {
    try {
      await this.stripe.paymentIntents.cancel(id);
    } catch {
      // Already paid or cancelled: nothing to do.
    }
  }

  async refund(input: Parameters<PaymentGateway['refund']>[0]) {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents,
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { id: refund.id, status: refundStatus(refund.status) };
  }

  parseWebhook(rawBody: string, signature: string): GatewayEvent {
    if (!this.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    const object = event.data.object as { object?: string };
    if (object.object === 'payment_intent') {
      return {
        id: event.id,
        type: event.type,
        intent: toIntent(object as Stripe.PaymentIntent),
        raw: event,
      };
    }
    if (object.object === 'refund') {
      const r = object as Stripe.Refund;
      return {
        id: event.id,
        type: event.type,
        refund: {
          id: r.id,
          status: refundStatus(r.status),
          paymentIntentId:
            typeof r.payment_intent === 'string'
              ? r.payment_intent
              : (r.payment_intent?.id ?? null),
        },
        raw: event,
      };
    }
    return { id: event.id, type: event.type, raw: event };
  }
}

// ── Selection ──────────────────────────────────────────────────────────────────────

/** SiteSetting key holding the portal-managed Stripe keys (secrets encrypted). */
export const STRIPE_SETTINGS_KEY = 'payments.stripe';

export type StoredStripeSettings = {
  publishableKey: string;
  secretKeyBox: string;
  webhookSecretBox: string | null;
  secretKeyLast4: string;
  updatedById: string;
  updatedByName: string;
  updatedAt: string;
};

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string | undefined;
  source: 'portal' | 'environment';
};

/** Keys from the portal settings, else from the environment; null when not set up. */
export async function loadStripeConfig(): Promise<StripeConfig | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STRIPE_SETTINGS_KEY } });
  const stored = row?.value as StoredStripeSettings | undefined;
  if (stored?.secretKeyBox) {
    const secretKey = decryptSecret(stored.secretKeyBox);
    if (secretKey) {
      return {
        secretKey,
        publishableKey: stored.publishableKey,
        webhookSecret: stored.webhookSecretBox
          ? (decryptSecret(stored.webhookSecretBox) ?? undefined)
          : undefined,
        source: 'portal',
      };
    }
    console.error('[payments] stored Stripe key cannot be decrypted (server secret changed?)');
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishable =
    process.env.STRIPE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return secret && publishable
    ? {
        secretKey: secret,
        publishableKey: publishable,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        source: 'environment',
      }
    : null;
}

const CACHE_MS = 60_000;
let override: PaymentGateway | null | undefined;
let cached: { gateway: PaymentGateway | null; until: number } | null = null;

/** The configured gateway, or null when online payment is not set up (yet). */
export async function getGateway(): Promise<PaymentGateway | null> {
  if (override !== undefined) return override;
  if (cached && cached.until > Date.now()) return cached.gateway;
  const config = await loadStripeConfig();
  const gateway = config
    ? new StripeGateway(config.secretKey, config.publishableKey, config.webhookSecret)
    : null;
  cached = { gateway, until: Date.now() + CACHE_MS };
  return gateway;
}

/** After the settings change: the next request builds the gateway from the new keys. */
export function resetGatewayCache() {
  cached = null;
}

/** Checks a secret key with Stripe before it is saved (read-only call). */
export async function verifyStripeSecretKey(secretKey: string): Promise<boolean> {
  if (keyVerifierOverride) return keyVerifierOverride(secretKey);
  try {
    await new Stripe(secretKey, { maxNetworkRetries: 1 }).balance.retrieve();
    return true;
  } catch {
    return false;
  }
}

let keyVerifierOverride: ((key: string) => boolean) | undefined;

/** Tests: replace the gateway (null = payments off); `undefined` restores the real one. */
export function setGatewayForTests(
  gateway: PaymentGateway | null | undefined,
  verifyKey?: (key: string) => boolean,
) {
  override = gateway;
  keyVerifierOverride = verifyKey;
  cached = null;
}

// ── Fake (tests) ───────────────────────────────────────────────────────────────────

/** In-memory gateway for tests: intents are created unpaid; call `pay()` to simulate a payment. */
export class FakeGateway implements PaymentGateway {
  readonly publishableKey = 'pk_test_fake';
  readonly intents = new Map<string, GatewayIntent>();
  readonly refunds: { id: string; paymentIntentId: string; amountCents: number }[] = [];
  private seq = 0;
  private readonly byKey = new Map<string, string>();

  async createIntent(input: Parameters<PaymentGateway['createIntent']>[0]) {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return this.intents.get(existing)!;
    this.seq += 1;
    const intent: GatewayIntent = {
      id: `pi_fake_${this.seq}`,
      clientSecret: `pi_fake_${this.seq}_secret`,
      status: 'requires_payment',
      amountCents: input.amountCents,
      method: null,
      lastError: null,
    };
    this.intents.set(intent.id, intent);
    this.byKey.set(input.idempotencyKey, intent.id);
    return intent;
  }

  async retrieveIntent(id: string) {
    const intent = this.intents.get(id);
    if (!intent) throw new Error(`unknown intent ${id}`);
    return intent;
  }

  async cancelIntent(id: string) {
    const intent = this.intents.get(id);
    if (intent && intent.status !== 'succeeded') intent.status = 'canceled';
  }

  async refund(input: Parameters<PaymentGateway['refund']>[0]) {
    this.seq += 1;
    this.refunds.push({
      id: `re_fake_${this.seq}`,
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
    });
    return { id: `re_fake_${this.seq}`, status: 'succeeded' as const };
  }

  parseWebhook(rawBody: string, signature: string): GatewayEvent {
    if (signature !== 'valid') throw new Error('bad signature');
    return JSON.parse(rawBody) as GatewayEvent;
  }

  /** Simulates the customer completing the payment (iDEAL by default). */
  pay(id: string, method: IntentMethod = 'IDEAL') {
    const intent = this.intents.get(id)!;
    intent.status = 'succeeded';
    intent.method = method;
    return intent;
  }
}
