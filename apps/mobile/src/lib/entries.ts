import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';

import { signedIn } from '@/lib/session';
import type { Localized } from '@/lib/tournaments';

/** A category I could enter (GET /tournaments/{slug}/entry-options). */
export type EntryOption = {
  id: string;
  discipline: string;
  name: Localized;
  ageCategory: { code: string; name: Localized } | null;
  level: string | null;
  feeCents: number;
  doubles: boolean;
  isOpen: boolean;
  maxEntries: number | null;
  taken: number;
  full: boolean;
  alreadyEntered: boolean;
  /** Why I can't play in it, e.g. 'gender', 'tooOld'. Empty when I can. */
  reasons: string[];
};

export type EntryOptions = {
  tournament: {
    id: string;
    slug: string;
    name: string;
    startsOn: string;
    phase: string;
    registrationClosesAt: string;
    withdrawalDeadline: string;
    maxEventsPerPlayer: number | null;
    payOnline: boolean;
  };
  player: { name: string; memberNumber: string; phone: string };
  events: EntryOption[];
  enteredCount: number;
};

export type EntryChoice = { eventId: string; partner?: string; lookingForPartner?: boolean };

export type EnterResult = {
  registrations: {
    id: string;
    status: 'PENDING' | 'CONFIRMED' | 'WAITLISTED';
    participantId: string | null;
    paymentStatus: string;
  }[];
  holdExpiresAt: string | null;
};

export async function fetchEntryOptions(slug: string): Promise<EntryOptions> {
  const body = await signedIn<EntryOptions>(
    'GET',
    `/tournaments/${encodeURIComponent(slug)}/entry-options`,
  );
  if (!body) throw new Error('The categories could not be loaded.');
  return body;
}

/** Enters the chosen categories; the terms are accepted by the player on the screen first. */
export async function enterTournament(slug: string, events: EntryChoice[]): Promise<EnterResult> {
  const body = await signedIn<EnterResult>(
    'POST',
    `/tournaments/${encodeURIComponent(slug)}/entries`,
    {
      events: events.map((e) => ({
        eventId: e.eventId,
        ...(e.partner?.trim() ? { partner: e.partner.trim() } : {}),
        lookingForPartner: !!e.lookingForPartner,
      })),
      acceptTerms: true,
    },
  );
  if (!body) throw new Error('Entering failed. Try again.');
  return body;
}

export async function withdrawEntry(registrationId: string): Promise<void> {
  // Send an empty object rather than no body: iOS adds Content-Length: 0 to a bodyless DELETE,
  // which older servers read as an invalid body.
  await signedIn('DELETE', `/me/registrations/${encodeURIComponent(registrationId)}`, {});
}

type Checkout = {
  orderId: string | null;
  orderNumber: string | null;
  amountCents: number;
  clientSecret: string | null;
  publishableKey: string;
};

type OrderStatus = { status: string };

export type PayOutcome = 'paid' | 'free' | 'canceled' | 'processing';

/**
 * Pays my unpaid shares in one tournament with Stripe's payment sheet (card, iDEAL, …). The
 * order and amount come from the website, which also applies the multi-category discount.
 * Returns 'canceled' when the player closes the sheet, and throws on a real failure.
 */
export async function payShares(participantIds: string[], code?: string): Promise<PayOutcome> {
  const checkout = await signedIn<Checkout>('POST', '/me/orders', {
    participantIds,
    ...(code?.trim() ? { code: code.trim() } : {}),
  });
  if (!checkout) throw new Error('The payment could not be started.');
  if (!checkout.clientSecret || !checkout.orderId) return 'free';

  await initStripe({ publishableKey: checkout.publishableKey, urlScheme: 'tourneasy' });
  const init = await initPaymentSheet({
    paymentIntentClientSecret: checkout.clientSecret,
    merchantDisplayName: 'Tourneasy',
    returnURL: 'tourneasy://stripe-redirect',
    allowsDelayedPaymentMethods: false,
  });
  if (init.error) throw new Error(init.error.message);
  const result = await presentPaymentSheet();
  if (result.error) {
    if (result.error.code === 'Canceled') return 'canceled';
    throw new Error(result.error.message);
  }
  // Ask the website, which checks with Stripe, rather than trusting the phone.
  const order = await signedIn<OrderStatus>('GET', `/me/orders/${checkout.orderId}`);
  return order?.status === 'PAID' ? 'paid' : 'processing';
}

export function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Why a category can't be entered, in the website's words. */
export const reasonText: Record<string, string> = {
  gender: 'Not for your gender',
  tooOld: 'You are too old for this age group',
  tooYoung: 'You are too young for this age group',
  levelTooLow: 'Your level is higher than this class',
  mixedNeedsBoth: 'Mixed doubles is for one man and one woman',
  birthDateUnknown: 'Date of birth still to be filled in',
};
