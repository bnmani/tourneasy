/**
 * Pricing for organisers (D87). Players are always free; organisers pick a package per
 * tournament (Free, Standard, Pro) or buy a bundle of Pro credits. Prices, the switch for the
 * whole feature (off until the owner turns it on), online payment, club discounts and the
 * company details on invoices are owner settings. While pricing is off nothing is enforced.
 * Prices exclude VAT; invoices add 21%.
 */
import { type PackageKey, Prisma, prisma } from '@tourneasy/db';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { getGateway } from '../payments/gateway';
import { assertCanManageTournament, assertOwner, isAdmin } from './permissions';
import type { Actor } from './session-service';

export const PRICING_KEY = 'pricing';
export const VAT_PERCENT = 21;
const DAY = 86_400_000;

export const PACKAGES = ['FREE', 'STANDARD', 'PRO', 'BUNDLE', 'CLUB'] as const;
/** Packages that run one tournament; a bundle gives Pro credits. */
const PER_TOURNAMENT: PackageKey[] = ['FREE', 'STANDARD', 'PRO'];

const planSchema = z.object({
  key: z.enum(PACKAGES),
  priceCents: z.number().int().min(0).max(1_000_000),
  /** Players per tournament; null = unlimited. */
  maxPlayers: z.number().int().min(1).max(100_000).nullable(),
  visible: z.boolean(),
  /** Bundle: tournaments it covers. */
  credits: z.number().int().min(1).max(100).optional(),
});
export type PlanSetting = z.infer<typeof planSchema>;

const companySchema = z.object({
  name: z.string().trim().max(120).default(''),
  address: z.string().trim().max(300).default(''),
  kvk: z.string().trim().max(20).default(''),
  vatNumber: z.string().trim().max(20).default(''),
  email: z.string().trim().max(254).default(''),
  iban: z.string().trim().max(40).default(''),
});

const settingsSchema = z.object({
  enabled: z.boolean(),
  onlinePayment: z.boolean(),
  plans: z.array(planSchema),
  company: companySchema,
});
export type PricingSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_PRICING: PricingSettings = {
  enabled: false,
  onlinePayment: true,
  plans: [
    { key: 'FREE', priceCents: 0, maxPlayers: 16, visible: true },
    { key: 'STANDARD', priceCents: 2900, maxPlayers: 64, visible: true },
    { key: 'PRO', priceCents: 5900, maxPlayers: null, visible: true },
    { key: 'BUNDLE', priceCents: 19900, maxPlayers: null, visible: true, credits: 5 },
    { key: 'CLUB', priceCents: 19900, maxPlayers: null, visible: false },
  ],
  company: { name: '', address: '', kvk: '', vatNumber: '', email: '', iban: '' },
};

/** Read on every page (the footer link) and every entry: cached briefly, cleared on save. */
const CACHE_MS = 30_000;
let cached: { value: PricingSettings; until: number } | null = null;

export function clearPricingCache() {
  cached = null;
}

export async function getPricing(): Promise<PricingSettings> {
  if (cached && cached.until > Date.now()) return cached.value;
  const row = await prisma.siteSetting.findUnique({ where: { key: PRICING_KEY } });
  const parsed = settingsSchema.safeParse(row?.value);
  // Packages added later get their defaults.
  const value = parsed.success
    ? {
        ...parsed.data,
        plans: DEFAULT_PRICING.plans.map(
          (d) => parsed.data.plans.find((p) => p.key === d.key) ?? d,
        ),
      }
    : DEFAULT_PRICING;
  cached = { value, until: Date.now() + CACHE_MS };
  return value;
}

const planOf = (settings: PricingSettings, key: PackageKey) =>
  settings.plans.find((p) => p.key === key)!;

// ── Owner settings ──────────────────────────────────────────────────────────────────

const saveSchema = z.object({
  enabled: z.boolean(),
  onlinePayment: z.boolean(),
  plans: z.array(
    planSchema.extend({
      price: z
        .string()
        .trim()
        .regex(/^\d{1,5}([.,]\d{1,2})?$/, 'invalid'),
      maxPlayers: z
        .string()
        .trim()
        .regex(/^\d{0,6}$/, 'invalid')
        .transform((v) => (v ? Number(v) : null)),
      priceCents: z.number().optional(),
    }),
  ),
  company: companySchema,
});

const euroToCents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);

export async function savePricing(actor: Actor, input: unknown, meta: RequestMeta) {
  assertOwner(actor);
  const data = parseInput(saveSchema, input);
  const before = await getPricing();
  const value: PricingSettings = {
    enabled: data.enabled,
    onlinePayment: data.onlinePayment,
    plans: DEFAULT_PRICING.plans.map((d) => {
      const p = data.plans.find((x) => x.key === d.key);
      if (!p) return planOf(before, d.key);
      return {
        key: d.key,
        priceCents: euroToCents(p.price),
        maxPlayers:
          d.key === 'FREE' || d.key === 'STANDARD' ? (p.maxPlayers ?? d.maxPlayers) : null,
        visible: p.visible,
        ...(d.key === 'BUNDLE' ? { credits: p.credits ?? d.credits } : {}),
      };
    }),
    company: data.company,
  };
  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: PRICING_KEY },
      create: { key: PRICING_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    await writeAudit(tx, {
      actorId: actor.userId,
      action: 'pricing.update',
      entityType: 'SiteSetting',
      entityId: PRICING_KEY,
      before: { enabled: before.enabled, plans: before.plans },
      after: { enabled: value.enabled, plans: value.plans },
      meta,
    });
  });
  clearPricingCache();
}

// ── Club discounts ──────────────────────────────────────────────────────────────────

const discountSchema = z.object({
  clubId: z.string().uuid(),
  percent: z.coerce.number().int().min(1, 'invalid').max(100, 'invalid'),
  validUntil: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'invalid')
    .optional(),
  code: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]*$/, 'invalid')
    .optional(),
  note: z.string().trim().max(200).optional(),
});

export async function listClubDiscounts(actor: Actor) {
  assertOwner(actor);
  return prisma.clubDiscount.findMany({
    orderBy: { club: { name: 'asc' } },
    select: {
      id: true,
      percent: true,
      validUntil: true,
      code: true,
      note: true,
      club: { select: { id: true, name: true } },
    },
  });
}

export async function saveClubDiscount(actor: Actor, input: unknown, meta: RequestMeta) {
  assertOwner(actor);
  const data = parseInput(discountSchema, input);
  const fields = {
    percent: data.percent,
    validUntil: data.validUntil ? new Date(data.validUntil) : null,
    code: data.code ? data.code.toUpperCase() : null,
    note: data.note || null,
  };
  try {
    await prisma.clubDiscount.upsert({
      where: { clubId: data.clubId },
      create: { clubId: data.clubId, ...fields, createdById: actor.userId },
      update: fields,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError('validation', { fields: { code: 'codeTaken' } });
    throw error;
  }
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'pricing.discount',
    entityType: 'Club',
    entityId: data.clubId,
    after: fields,
    meta,
  });
}

export async function removeClubDiscount(actor: Actor, id: string, meta: RequestMeta) {
  assertOwner(actor);
  const d = await prisma.clubDiscount.delete({ where: { id } }).catch(() => null);
  if (!d) throw new AppError('notFound');
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'pricing.discountRemoved',
    entityType: 'Club',
    entityId: d.clubId,
    meta,
  });
}

/** The discount for this organiser: by code, else through their club. */
export async function discountFor(userId: string | null, code?: string | null, now = new Date()) {
  const active = {
    OR: [{ validUntil: null }, { validUntil: { gte: new Date(now.toDateString()) } }],
  };
  const select = { percent: true, clubId: true, club: { select: { name: true } } };
  const typed = code?.trim().toUpperCase();
  if (typed) {
    const d = await prisma.clubDiscount.findFirst({ where: { code: typed, ...active }, select });
    if (d) return { percent: d.percent, clubId: d.clubId, clubName: d.club.name };
  }
  if (!userId) return null;
  const profile = await prisma.playerProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { clubId: true },
  });
  if (!profile?.clubId) return null;
  const d = await prisma.clubDiscount.findFirst({
    where: { clubId: profile.clubId, ...active },
    select,
  });
  return d ? { percent: d.percent, clubId: d.clubId, clubName: d.club.name } : null;
}

/** Price, discount, VAT and total, in cents. */
export function quote(priceCents: number, discountPercent = 0) {
  const discountCents = Math.round((priceCents * discountPercent) / 100);
  const netCents = priceCents - discountCents;
  const vatCents = Math.round((netCents * VAT_PERCENT) / 100);
  return {
    priceCents,
    discountPercent,
    discountCents,
    netCents,
    vatCents,
    totalCents: netCents + vatCents,
  };
}

// ── Public page ─────────────────────────────────────────────────────────────────────

/** What the pricing page shows; null while pricing is switched off. */
export async function publicPricing(viewer: Actor | null) {
  const settings = await getPricing();
  if (!settings.enabled) return null;
  const discount = await discountFor(viewer?.userId ?? null);
  return {
    onlinePayment: settings.onlinePayment,
    discount,
    plans: settings.plans
      .filter((p) => p.visible)
      .map((p) => ({
        ...p,
        quote: quote(p.priceCents, p.priceCents ? (discount?.percent ?? 0) : 0),
      })),
  };
}

export async function pricingEnabled(): Promise<boolean> {
  return (await getPricing()).enabled;
}

// ── Enforcement (only while pricing is on) ─────────────────────────────────────────

/** The tournament's player cap: its own maximum and its package's limit, whichever is lower. */
export async function effectiveMaxParticipants(t: {
  maxParticipants: number | null;
  packageKey: PackageKey | null;
}): Promise<number | null> {
  const settings = await getPricing();
  if (!settings.enabled || !t.packageKey) return t.maxParticipants;
  const limit = planOf(settings, t.packageKey).maxPlayers;
  if (limit === null) return t.maxParticipants;
  return t.maxParticipants === null ? limit : Math.min(t.maxParticipants, limit);
}

/** Opening entries needs a package while pricing is on. */
export async function assertPackageToOpen(t: { packageKey: PackageKey | null }) {
  if ((await getPricing()).enabled && !t.packageKey) throw new AppError('packageRequired');
}

// ── Buying ──────────────────────────────────────────────────────────────────────────

const buySchema = z.object({
  packageKey: z.enum(['FREE', 'STANDARD', 'PRO', 'BUNDLE']),
  tournamentId: z.string().uuid().optional(),
  code: z.string().trim().max(30).optional(),
});

async function bundleCredits(userId: string, now = new Date()) {
  const bundles = await prisma.packagePurchase.findMany({
    where: {
      userId,
      packageKey: 'BUNDLE',
      status: 'PAID',
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
    select: { id: true, credits: true, _count: { select: { tournaments: true } } },
    orderBy: { paidAt: 'asc' },
  });
  return bundles
    .map((b) => ({ id: b.id, left: b.credits - b._count.tournaments }))
    .filter((b) => b.left > 0);
}

/** The package card on a tournament's overview. */
export async function tournamentPackage(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const settings = await getPricing();
  if (!settings.enabled) return null;
  const [t, discount, credits, pending, entries] = await Promise.all([
    prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { packageKey: true },
    }),
    discountFor(actor.userId),
    bundleCredits(actor.userId),
    prisma.packagePurchase.findFirst({
      where: { tournamentId, status: { in: ['REQUESTED', 'PENDING'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, packageKey: true, status: true, totalCents: true },
    }),
    prisma.registrationParticipant.count({
      where: {
        active: true,
        registration: { status: { in: ['PENDING', 'CONFIRMED'] }, event: { tournamentId } },
      },
    }),
  ]);
  return {
    current: t.packageKey,
    onlinePayment: settings.onlinePayment,
    discount,
    creditsLeft: credits.reduce((n, b) => n + b.left, 0),
    pending,
    entries,
    options: settings.plans
      .filter((p) => PER_TOURNAMENT.includes(p.key) && p.visible)
      .map((p) => ({
        ...p,
        quote: quote(p.priceCents, p.priceCents ? (discount?.percent ?? 0) : 0),
      })),
  };
}

async function setPackage(
  db: Prisma.TransactionClient,
  tournamentId: string,
  packageKey: PackageKey,
  purchaseId: string | null,
) {
  await db.tournament.update({
    where: { id: tournamentId },
    data: { packageKey, packagePurchaseId: purchaseId },
  });
}

/**
 * An earlier purchase still open for the same tournament (or bundle). An invoice request blocks
 * a new one until the owner marks it paid or cancels it. An unfinished online payment is checked
 * with Stripe: paid after all, it is applied; otherwise it is cancelled so a new one can start.
 */
async function settleOpenPurchase(
  userId: string,
  tournamentId: string | null,
): Promise<'none' | 'paid'> {
  const open = await prisma.packagePurchase.findFirst({
    where: {
      status: { in: ['REQUESTED', 'PENDING'] },
      ...(tournamentId ? { tournamentId } : { userId, tournamentId: null, packageKey: 'BUNDLE' }),
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!open) return 'none';
  if (open.status === 'REQUESTED') throw new AppError('purchasePending');
  if (open.stripePaymentIntentId) {
    const gateway = await getGateway();
    if (!gateway) throw new AppError('purchasePending');
    const intent = await gateway.retrieveIntent(open.stripePaymentIntentId);
    if (intent.status === 'succeeded') {
      await markPaid(open.id, null);
      return 'paid';
    }
    if (intent.status === 'processing') throw new AppError('purchasePending');
    await gateway.cancelIntent(open.stripePaymentIntentId);
  }
  await prisma.packagePurchase.update({ where: { id: open.id }, data: { status: 'CANCELLED' } });
  return 'none';
}

export type BuyResult =
  | { kind: 'done' }
  | { kind: 'requested'; purchaseId: string }
  | {
      kind: 'pay';
      purchaseId: string;
      clientSecret: string;
      publishableKey: string;
      totalCents: number;
    };

/**
 * Picks or buys a package. Free (within its limit) and a bundle credit apply at once; a paid
 * package is paid online, or requested for an invoice when online payment is off.
 */
export async function buyPackage(
  actor: Actor,
  input: unknown,
  meta: RequestMeta,
): Promise<BuyResult> {
  const data = parseInput(buySchema, input);
  const settings = await getPricing();
  if (!settings.enabled) throw new AppError('notFound');
  if (data.packageKey !== 'BUNDLE') {
    if (!data.tournamentId)
      throw new AppError('validation', { fields: { tournamentId: 'required' } });
    await assertCanManageTournament(actor, data.tournamentId);
  } else if (!actor.roles.includes('ORGANISER') && !isAdmin(actor)) {
    throw new AppError('forbidden');
  }
  const plan = planOf(settings, data.packageKey);
  if (!plan.visible && data.packageKey !== 'FREE') throw new AppError('notFound');

  if (data.packageKey === 'FREE') {
    const tournamentId = data.tournamentId!;
    const entries = await prisma.registrationParticipant.count({
      where: {
        active: true,
        registration: { status: { in: ['PENDING', 'CONFIRMED'] }, event: { tournamentId } },
      },
    });
    if (plan.maxPlayers !== null && entries > plan.maxPlayers)
      throw new AppError('packageTooSmall', { max: plan.maxPlayers });
    await setPackage(prisma, tournamentId, 'FREE', null);
    await writeAudit(prisma, {
      actorId: actor.userId,
      action: 'pricing.package',
      entityType: 'Tournament',
      entityId: tournamentId,
      after: { packageKey: 'FREE' },
      meta,
    });
    return { kind: 'done' };
  }

  // One open purchase per tournament (or per organiser for a bundle): no double invoices.
  const settled = await settleOpenPurchase(actor.userId, data.tournamentId ?? null);
  if (settled === 'paid') return { kind: 'done' };

  const discount = await discountFor(actor.userId, data.code);
  const q = quote(plan.priceCents, discount?.percent ?? 0);
  const purchase = await prisma.packagePurchase.create({
    data: {
      userId: actor.userId,
      packageKey: data.packageKey,
      tournamentId: data.tournamentId ?? null,
      credits: data.packageKey === 'BUNDLE' ? (plan.credits ?? 5) : 0,
      priceCents: q.priceCents,
      discountPercent: q.discountPercent,
      netCents: q.netCents,
      vatCents: q.vatCents,
      totalCents: q.totalCents,
      clubId: discount?.clubId ?? null,
      status: 'REQUESTED',
    },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'pricing.purchase',
    entityType: 'PackagePurchase',
    entityId: purchase.id,
    after: { packageKey: data.packageKey, totalCents: q.totalCents },
    meta,
  });
  if (q.totalCents === 0) {
    await markPaid(purchase.id, null);
    return { kind: 'done' };
  }
  const gateway = settings.onlinePayment ? await getGateway() : null;
  if (!gateway) return { kind: 'requested', purchaseId: purchase.id };
  const intent = await gateway.createIntent({
    amountCents: q.totalCents,
    description: `Tourneasy ${data.packageKey.toLowerCase()} package`,
    metadata: { kind: 'package', purchaseId: purchase.id },
    idempotencyKey: `package:${purchase.id}`,
  });
  await prisma.packagePurchase.update({
    where: { id: purchase.id },
    data: { status: 'PENDING', stripePaymentIntentId: intent.id },
  });
  return {
    kind: 'pay',
    purchaseId: purchase.id,
    clientSecret: intent.clientSecret!,
    publishableKey: gateway.publishableKey,
    totalCents: q.totalCents,
  };
}

/** Uses one Pro credit from a bundle for this tournament. */
export async function applyBundleCredit(actor: Actor, tournamentId: string, meta: RequestMeta) {
  await assertCanManageTournament(actor, tournamentId);
  if (!(await pricingEnabled())) throw new AppError('notFound');
  const [bundle] = await bundleCredits(actor.userId);
  if (!bundle) throw new AppError('noCreditsLeft');
  await setPackage(prisma, tournamentId, 'PRO', bundle.id);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'pricing.package',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { packageKey: 'PRO', bundle: bundle.id },
    meta,
  });
}

/** Paid: the invoice number, and the package on the tournament (or the bundle's credits). */
async function markPaid(purchaseId: string, markedBy: string | null, now = new Date()) {
  await prisma.$transaction(
    async (tx) => {
      const p = await tx.packagePurchase.findUniqueOrThrow({ where: { id: purchaseId } });
      if (p.status === 'PAID') return;
      const year = now.getUTCFullYear();
      const count = await tx.packagePurchase.count({
        where: { invoiceNumber: { startsWith: `TE-${year}-` } },
      });
      await tx.packagePurchase.update({
        where: { id: purchaseId },
        data: {
          status: 'PAID',
          paidAt: now,
          markedPaidById: markedBy,
          invoiceNumber: `TE-${year}-${String(count + 1).padStart(4, '0')}`,
          ...(p.packageKey === 'BUNDLE' ? { validUntil: new Date(now.getTime() + 365 * DAY) } : {}),
        },
      });
      if (p.tournamentId) await setPackage(tx, p.tournamentId, p.packageKey, p.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** The webhook (or the return page) reports a package payment. */
export async function applyPackageIntent(intent: { id: string; status: string }) {
  const p = await prisma.packagePurchase.findUnique({
    where: { stripePaymentIntentId: intent.id },
    select: { id: true, status: true },
  });
  if (!p) return false;
  if (intent.status === 'succeeded' && p.status !== 'PAID') await markPaid(p.id, null);
  return true;
}

/** After returning from the bank: ask Stripe, then where to send the organiser. */
export async function reconcilePurchase(actor: Actor, purchaseId: string) {
  const p = await prisma.packagePurchase.findUnique({
    where: { id: purchaseId },
    select: { userId: true, tournamentId: true, stripePaymentIntentId: true },
  });
  if (!p || p.userId !== actor.userId) throw new AppError('notFound');
  const gateway = await getGateway();
  if (gateway && p.stripePaymentIntentId)
    await applyPackageIntent(await gateway.retrieveIntent(p.stripePaymentIntentId));
  const fresh = await prisma.packagePurchase.findUniqueOrThrow({
    where: { id: purchaseId },
    select: { status: true },
  });
  return { tournamentId: p.tournamentId, status: fresh.status };
}

/** Owner: an invoice was paid by bank transfer. */
export async function ownerMarkPaid(actor: Actor, purchaseId: string, meta: RequestMeta) {
  assertOwner(actor);
  const p = await prisma.packagePurchase.findUnique({ where: { id: purchaseId } });
  if (!p || p.status === 'CANCELLED') throw new AppError('notFound');
  await markPaid(purchaseId, actor.userId);
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'pricing.markedPaid',
    entityType: 'PackagePurchase',
    entityId: purchaseId,
    meta,
  });
}

export async function ownerCancelPurchase(actor: Actor, purchaseId: string, meta: RequestMeta) {
  assertOwner(actor);
  const done = await prisma.packagePurchase.updateMany({
    where: { id: purchaseId, status: { in: ['REQUESTED', 'PENDING'] } },
    data: { status: 'CANCELLED' },
  });
  if (!done.count) throw new AppError('notFound');
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'pricing.cancelled',
    entityType: 'PackagePurchase',
    entityId: purchaseId,
    meta,
  });
}

/** Owner: all purchases, newest first. */
export async function listPurchases(actor: Actor, take = 100) {
  assertOwner(actor);
  return prisma.packagePurchase.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      invoiceNumber: true,
      packageKey: true,
      status: true,
      netCents: true,
      totalCents: true,
      discountPercent: true,
      createdAt: true,
      paidAt: true,
      user: { select: { name: true, email: true } },
      tournament: { select: { name: true } },
    },
  });
}

/** One paid purchase for its invoice: the buyer or the owner. */
export async function invoiceData(actor: Actor, purchaseId: string) {
  const p = await prisma.packagePurchase.findUnique({
    where: { id: purchaseId },
    include: {
      user: { select: { name: true, email: true } },
      tournament: { select: { name: true } },
    },
  });
  const owner = actor.roles.includes('OWNER');
  if (!p || p.status !== 'PAID' || (!owner && p.userId !== actor.userId))
    throw new AppError('notFound');
  return { purchase: p, company: (await getPricing()).company };
}

/** Owner: clubs to pick for a discount. */
export async function discountClubOptions(actor: Actor) {
  assertOwner(actor);
  return prisma.club.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}
