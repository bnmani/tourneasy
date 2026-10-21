/** Entering a tournament (D48): the entry form, partner identification and withdrawals. */
import { z } from 'zod';
import { phoneSchema } from './auth';

/** Partner by member number ("TE100023") or email address. */
export const partnerIdentifierSchema = z
  .string()
  .trim()
  .max(254, 'tooLong')
  .refine((v) => /^TE\d{6}$/i.test(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'partnerNotFound');

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const entryEventSchema = z.object({
  eventId: z.string().uuid('invalid'),
  partner: z.preprocess(emptyToUndefined, partnerIdentifierSchema.optional()),
  lookingForPartner: z.boolean().default(false),
});

export const entrySchema = z.object({
  events: z.array(entryEventSchema).min(1, 'chooseEvent').max(10, 'maxEvents'),
  /** Optional: update the mobile number on the profile while entering. */
  phone: z.preprocess(emptyToUndefined, phoneSchema.optional()),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'mustAccept' }) }),
});
export type EntryInput = z.infer<typeof entrySchema>;

export const withdrawSchema = z.object({
  reason: z.preprocess(emptyToUndefined, z.string().trim().max(500, 'tooLong').optional()),
});

/** Version of the tournament terms players accept when entering (stored per entry). */
export const ENTRY_TERMS_VERSION = '2026-10';

// ── Payments (Phase 5, D51) ─────────────────────────────────────────────────────────

/** Paying one or more of my unpaid entry shares in one tournament. */
export const checkoutSchema = z.object({
  participantIds: z.array(z.string().uuid('invalid')).min(1, 'chooseEvent').max(20),
});

/** Organiser records a share as paid at the desk (cash / bank transfer). */
export const manualPaymentSchema = z.object({ participantId: z.string().uuid('invalid') });

export const refundDecisionSchema = z.object({
  refundId: z.string().uuid('invalid'),
  decision: z.enum(['approve', 'reject']),
});
