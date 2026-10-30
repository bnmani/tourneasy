/**
 * Food and drink ordering (D87). The owner allows it per tournament, or it comes with the Pro
 * package while pricing is on. The organiser builds a menu per tournament (name, price,
 * allergens, an optional stock limit), sets an order deadline and pickup details, and switches
 * it on. Players who entered the tournament order and pay online (or pay at pickup when
 * online payment isn't set up); the organiser sees totals per item, marks orders collected and
 * can refund. Orders keep the name and price at the moment of ordering. No alcohol.
 */
import { type FoodOrderStatus, Prisma, prisma } from '@tourneasy/db';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { toXlsxBook } from '../lib/xlsx';
import { getGateway } from '../payments/gateway';
import { assertCanManageTournament, assertOwner } from './permissions';
import { getPricing } from './pricing-service';
import type { Actor } from './session-service';

/** The 14 allergens EU law requires to be shown before ordering. */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

/** An online payment not finished within this time no longer holds stock. */
const HOLD_MS = 30 * 60_000;

// ── Who may use it ──────────────────────────────────────────────────────────────────

/** Whether food ordering is allowed for this tournament: the owner's switch, or Pro while pricing is on. */
export async function foodAllowed(tournamentId: string): Promise<boolean> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { packageKey: true, foodAllowed: true },
  });
  if (!t) return false;
  if (t.foodAllowed) return true;
  return t.packageKey === 'PRO' && (await getPricing()).enabled;
}

/**
 * Owner: allows (or stops) food ordering for one tournament. Per tournament, not per organiser:
 * someone running three tournaments may have food at only one of them.
 */
export async function setFoodAccess(
  actor: Actor,
  tournamentId: string,
  enabled: boolean,
  meta: RequestMeta,
) {
  assertOwner(actor);
  await prisma.tournament.update({
    where: { id: tournamentId },
    // Taking it away also closes ordering; the menu and orders stay.
    data: { foodAllowed: enabled, ...(enabled ? {} : { foodOrderingOn: false }) },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.access',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { enabled },
    meta,
  });
}

// ── Organiser: settings and menu ────────────────────────────────────────────────────

/** Orders that count for stock and the kitchen: paid, pay-at-pickup, or a payment under way. */
const liveOrder = (now: Date): Prisma.FoodOrderWhereInput => ({
  OR: [
    { status: 'PAID' },
    { status: 'PENDING', stripePaymentIntentId: null },
    { status: 'PENDING', createdAt: { gt: new Date(now.getTime() - HOLD_MS) } },
  ],
});

async function orderedPerItem(tournamentId: string, now = new Date()) {
  const rows = await prisma.foodOrderLine.groupBy({
    by: ['foodItemId'],
    where: { order: { tournamentId, ...liveOrder(now) } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.foodItemId, r._sum.quantity ?? 0]));
}

export async function foodSettings(actor: Actor, tournamentId: string) {
  await assertCanManageTournament(actor, tournamentId);
  const [t, items, ordered, allowed] = await Promise.all([
    prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { foodOrderingOn: true, foodCutoffAt: true, foodPickupInfo: true, slug: true },
    }),
    prisma.foodItem.findMany({
      where: { tournamentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    orderedPerItem(tournamentId),
    foodAllowed(tournamentId),
  ]);
  return {
    allowed,
    ...t,
    items: items.map((i) => ({ ...i, ordered: ordered.get(i.id) ?? 0 })),
  };
}

const settingsSchema = z.object({
  on: z.boolean(),
  /** "2027-03-12T20:00", Dutch time. */
  cutoffAt: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/, 'invalid'),
  pickupInfo: z.string().trim().max(200).optional(),
});

export async function saveFoodSettings(
  actor: Actor,
  tournamentId: string,
  input: unknown,
  meta: RequestMeta,
  toUtc: (local: string) => Date | null,
) {
  await assertCanManageTournament(actor, tournamentId);
  if (!(await foodAllowed(tournamentId))) throw new AppError('foodUnavailable');
  const data = parseInput(settingsSchema, input);
  const cutoffAt = data.cutoffAt ? toUtc(data.cutoffAt) : null;
  if (data.on && !cutoffAt) throw new AppError('validation', { fields: { cutoffAt: 'required' } });
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      foodOrderingOn: data.on,
      foodCutoffAt: cutoffAt,
      foodPickupInfo: data.pickupInfo || null,
    },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.settings',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { on: data.on, cutoffAt: data.cutoffAt || null },
    meta,
  });
}

const itemSchema = z
  .object({
    name: z.string().trim().min(1, 'required').max(80),
    description: z.string().trim().max(200).optional(),
    price: z
      .string()
      .trim()
      .regex(/^\d{1,4}([.,]\d{1,2})?$/, 'invalid'),
    allergens: z.array(z.enum(ALLERGENS)).default([]),
    noAllergens: z.boolean().default(false),
    maxQuantity: z
      .string()
      .trim()
      .regex(/^\d{0,5}$/, 'invalid')
      .optional(),
    active: z.boolean().default(true),
  })
  // Allergen information is required: either a list, or "contains none" on purpose.
  .refine((v) => v.noAllergens || v.allergens.length > 0, {
    path: ['allergens'],
    message: 'allergensRequired',
  })
  .refine((v) => !(v.noAllergens && v.allergens.length > 0), {
    path: ['allergens'],
    message: 'invalid',
  });

export async function saveFoodItem(
  actor: Actor,
  tournamentId: string,
  itemId: string | null,
  input: unknown,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  if (!(await foodAllowed(tournamentId))) throw new AppError('foodUnavailable');
  const d = parseInput(itemSchema, input);
  const data = {
    name: d.name,
    description: d.description || null,
    priceCents: Math.round(Number(d.price.replace(',', '.')) * 100),
    allergens: d.allergens,
    noAllergens: d.noAllergens,
    maxQuantity: d.maxQuantity ? Number(d.maxQuantity) : null,
    active: d.active,
  };
  const item = itemId
    ? await prisma.foodItem.update({ where: { id: itemId, tournamentId }, data })
    : await prisma.foodItem.create({
        data: {
          ...data,
          tournamentId,
          sortOrder: await prisma.foodItem.count({ where: { tournamentId } }),
        },
      });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: itemId ? 'food.itemUpdated' : 'food.itemAdded',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { item: item.name, priceCents: item.priceCents },
    meta,
  });
}

/** Removes an item never ordered; one with orders is hidden instead, so orders stay intact. */
export async function removeFoodItem(
  actor: Actor,
  tournamentId: string,
  itemId: string,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const used = await prisma.foodOrderLine.count({ where: { foodItemId: itemId } });
  if (used)
    await prisma.foodItem.update({ where: { id: itemId, tournamentId }, data: { active: false } });
  else await prisma.foodItem.delete({ where: { id: itemId, tournamentId } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.itemRemoved',
    entityType: 'Tournament',
    entityId: tournamentId,
    after: { itemId, hidden: used > 0 },
    meta,
  });
}

// ── Players ─────────────────────────────────────────────────────────────────────────

async function publicTournament(slug: string) {
  const t = await prisma.tournament.findFirst({
    where: { slug, isPublished: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      foodOrderingOn: true,
      foodCutoffAt: true,
      foodPickupInfo: true,
    },
  });
  if (!t) throw new AppError('notFound');
  return t;
}

/** Whether ordering is open now: switched on, allowed, before the deadline. */
async function orderingOpen(
  t: { id: string; foodOrderingOn: boolean; foodCutoffAt: Date | null },
  now = new Date(),
) {
  return t.foodOrderingOn && !!t.foodCutoffAt && t.foodCutoffAt > now && (await foodAllowed(t.id));
}

async function hasEntry(userId: string, tournamentId: string) {
  return (
    (await prisma.registrationParticipant.count({
      where: {
        active: true,
        player: { userId },
        registration: {
          status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] },
          event: { tournamentId },
        },
      },
    })) > 0
  );
}

const pickupQr = (orderNumber: string) =>
  QRCode.toString(orderNumber, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

/** The menu for players, and the viewer's own orders; null when food isn't offered. */
export async function foodMenu(viewer: Actor | null, slug: string, now = new Date()) {
  const t = await publicTournament(slug);
  if (!t.foodOrderingOn || !(await foodAllowed(t.id))) return null;
  const [items, ordered] = await Promise.all([
    prisma.foodItem.findMany({
      where: { tournamentId: t.id, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    orderedPerItem(t.id, now),
  ]);
  const mine = viewer
    ? await prisma.foodOrder.findMany({
        where: { tournamentId: t.id, userId: viewer.userId, status: { in: ['PENDING', 'PAID'] } },
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      })
    : [];
  return {
    tournament: t,
    open: await orderingOpen(t, now),
    canOrder: !!viewer && (await hasEntry(viewer.userId, t.id)),
    items: items.map((i) => ({
      ...i,
      left: i.maxQuantity === null ? null : Math.max(0, i.maxQuantity - (ordered.get(i.id) ?? 0)),
    })),
    orders: await Promise.all(
      mine
        // An online payment that never finished isn't an order to show.
        .filter(
          (o) =>
            o.status === 'PAID' ||
            !o.stripePaymentIntentId ||
            o.createdAt > new Date(now.getTime() - HOLD_MS),
        )
        .map(async (o) => ({ ...o, qrSvg: await pickupQr(o.orderNumber) })),
    ),
  };
}

const orderSchema = z.object({
  lines: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(0).max(50) }))
    .max(50),
});

export type FoodCheckout =
  | { kind: 'placed'; orderId: string }
  | {
      kind: 'pay';
      orderId: string;
      clientSecret: string;
      publishableKey: string;
      totalCents: number;
    };

/**
 * Places an order: checks the deadline, the menu and stock, keeps names and prices, and
 * starts the online payment (or leaves it to pay at pickup when that isn't set up).
 */
export async function placeFoodOrder(
  actor: Actor,
  slug: string,
  input: unknown,
  meta: RequestMeta,
  now = new Date(),
): Promise<FoodCheckout> {
  const t = await publicTournament(slug);
  if (!(await orderingOpen(t, now))) throw new AppError('foodClosed');
  if (!(await hasEntry(actor.userId, t.id))) throw new AppError('forbidden');
  const { lines } = parseInput(orderSchema, input);
  const wanted = lines.filter((l) => l.quantity > 0);
  if (wanted.length === 0) throw new AppError('emptyOrder');

  const order = await prisma.$transaction(
    async (tx) => {
      const items = await tx.foodItem.findMany({
        where: { id: { in: wanted.map((l) => l.itemId) }, tournamentId: t.id, active: true },
      });
      if (items.length !== new Set(wanted.map((l) => l.itemId)).size)
        throw new AppError('validation', { fields: { lines: 'invalid' } });
      const counts = await tx.foodOrderLine.groupBy({
        by: ['foodItemId'],
        where: { foodItemId: { in: items.map((i) => i.id) }, order: liveOrder(now) },
        _sum: { quantity: true },
      });
      const taken = new Map(counts.map((c) => [c.foodItemId, c._sum.quantity ?? 0]));
      for (const l of wanted) {
        const item = items.find((i) => i.id === l.itemId)!;
        if (item.maxQuantity !== null && (taken.get(item.id) ?? 0) + l.quantity > item.maxQuantity)
          throw new AppError('foodSoldOut', { item: item.name });
      }
      const totalCents = wanted.reduce(
        (sum, l) => sum + items.find((i) => i.id === l.itemId)!.priceCents * l.quantity,
        0,
      );
      return tx.foodOrder.create({
        data: {
          orderNumber: `F-${randomBytes(4).toString('hex').toUpperCase()}`,
          tournamentId: t.id,
          userId: actor.userId,
          totalCents,
          lines: {
            create: wanted.map((l) => {
              const item = items.find((i) => i.id === l.itemId)!;
              return {
                foodItemId: item.id,
                name: item.name,
                unitPriceCents: item.priceCents,
                quantity: l.quantity,
              };
            }),
          },
        },
      });
    },
    // Two players ordering the last portions at the same moment: one of them gets "sold out".
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.ordered',
    entityType: 'FoodOrder',
    entityId: order.id,
    after: { totalCents: order.totalCents },
    meta,
  });
  const gateway = await getGateway();
  if (!gateway || order.totalCents === 0) return { kind: 'placed', orderId: order.id };
  const intent = await gateway.createIntent({
    amountCents: order.totalCents,
    description: `Food ${order.orderNumber} · ${t.name}`,
    metadata: { kind: 'food', foodOrderId: order.id },
    idempotencyKey: `food:${order.id}`,
  });
  await prisma.foodOrder.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: intent.id },
  });
  return {
    kind: 'pay',
    orderId: order.id,
    clientSecret: intent.clientSecret!,
    publishableKey: gateway.publishableKey,
    totalCents: order.totalCents,
  };
}

/** The webhook (or the return page) reports a food payment. */
export async function applyFoodIntent(intent: { id: string; status: string }) {
  const o = await prisma.foodOrder.findUnique({
    where: { stripePaymentIntentId: intent.id },
    select: { id: true, status: true },
  });
  if (!o) return false;
  if (intent.status === 'succeeded' && o.status === 'PENDING')
    await prisma.foodOrder.update({
      where: { id: o.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  if ((intent.status === 'canceled' || intent.status === 'failed') && o.status === 'PENDING')
    await prisma.foodOrder.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
  return true;
}

/** After returning from the bank: ask Stripe, then where to send the player. */
export async function reconcileFoodOrder(actor: Actor, orderId: string) {
  const o = await prisma.foodOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, stripePaymentIntentId: true, tournament: { select: { slug: true } } },
  });
  if (!o || o.userId !== actor.userId) throw new AppError('notFound');
  const gateway = await getGateway();
  if (gateway && o.stripePaymentIntentId)
    await applyFoodIntent(await gateway.retrieveIntent(o.stripePaymentIntentId));
  const fresh = await prisma.foodOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  return { slug: o.tournament.slug, status: fresh.status };
}

// ── Organiser: orders, kitchen, pickup ──────────────────────────────────────────────

export async function foodOrders(actor: Actor, tournamentId: string, now = new Date()) {
  await assertCanManageTournament(actor, tournamentId);
  const orders = await prisma.foodOrder.findMany({
    where: { tournamentId, ...liveOrder(now) },
    orderBy: { createdAt: 'asc' },
    include: {
      lines: true,
      user: {
        select: {
          name: true,
          playerProfile: {
            select: { firstName: true, lastNamePrefix: true, lastName: true, memberNumber: true },
          },
        },
      },
    },
  });
  const totals = new Map<string, { name: string; quantity: number; collected: number }>();
  for (const o of orders)
    for (const l of o.lines) {
      const t = totals.get(l.foodItemId) ?? { name: l.name, quantity: 0, collected: 0 };
      t.quantity += l.quantity;
      if (o.collectedAt) t.collected += l.quantity;
      totals.set(l.foodItemId, t);
    }
  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      online: !!o.stripePaymentIntentId,
      totalCents: o.totalCents,
      collectedAt: o.collectedAt,
      name: o.user.playerProfile
        ? [
            o.user.playerProfile.firstName,
            o.user.playerProfile.lastNamePrefix,
            o.user.playerProfile.lastName,
          ]
            .filter(Boolean)
            .join(' ')
        : o.user.name,
      memberNumber: o.user.playerProfile?.memberNumber ?? null,
      lines: o.lines.map((l) => ({ name: l.name, quantity: l.quantity })),
    })),
    totals: [...totals.values()],
    revenueCents: orders.filter((o) => o.status === 'PAID').reduce((n, o) => n + o.totalCents, 0),
  };
}

/** Handed out at the counter; an order paid at pickup is marked paid at the same time. */
export async function markCollected(
  actor: Actor,
  tournamentId: string,
  orderId: string,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const o = await prisma.foodOrder.findFirst({ where: { id: orderId, tournamentId } });
  if (!o || (o.status !== 'PAID' && !(o.status === 'PENDING' && !o.stripePaymentIntentId)))
    throw new AppError('notFound');
  const now = new Date();
  await prisma.foodOrder.update({
    where: { id: orderId },
    data: {
      collectedAt: now,
      collectedById: actor.userId,
      ...(o.status === 'PENDING' ? { status: 'PAID' as FoodOrderStatus, paidAt: now } : {}),
    },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.collected',
    entityType: 'FoodOrder',
    entityId: orderId,
    meta,
  });
}

/** Cancels an order; one paid online is refunded in full. */
export async function refundFoodOrder(
  actor: Actor,
  tournamentId: string,
  orderId: string,
  meta: RequestMeta,
) {
  await assertCanManageTournament(actor, tournamentId);
  const o = await prisma.foodOrder.findFirst({ where: { id: orderId, tournamentId } });
  if (!o || o.collectedAt || (o.status !== 'PAID' && o.status !== 'PENDING'))
    throw new AppError('notFound');
  if (o.status === 'PAID' && o.stripePaymentIntentId) {
    const gateway = await getGateway();
    if (!gateway) throw new AppError('paymentsUnavailable');
    await gateway.refund({
      paymentIntentId: o.stripePaymentIntentId,
      amountCents: o.totalCents,
      idempotencyKey: `food-refund:${o.id}`,
      metadata: { kind: 'food', foodOrderId: o.id },
    });
  }
  await prisma.foodOrder.update({
    where: { id: orderId },
    data: { status: o.status === 'PAID' && o.stripePaymentIntentId ? 'REFUNDED' : 'CANCELLED' },
  });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: 'food.refunded',
    entityType: 'FoodOrder',
    entityId: orderId,
    after: { totalCents: o.totalCents },
    meta,
  });
}

/** Excel for the kitchen: totals per item, and every order with the player. */
export async function foodOrdersXlsx(actor: Actor, tournamentId: string, locale: 'nl' | 'en') {
  const { orders, totals } = await foodOrders(actor, tournamentId);
  const nl = locale === 'nl';
  return toXlsxBook([
    {
      name: nl ? 'Keuken' : 'Kitchen',
      header: nl ? ['Item', 'Aantal', 'Afgehaald'] : ['Item', 'Quantity', 'Collected'],
      rows: totals.map((t) => [t.name, t.quantity, t.collected]),
    },
    {
      name: nl ? 'Bestellingen' : 'Orders',
      header: nl
        ? ['Bestelling', 'Speler', 'Lidnummer', 'Items', 'Bedrag', 'Betaald', 'Afgehaald']
        : ['Order', 'Player', 'Member number', 'Items', 'Amount', 'Paid', 'Collected'],
      rows: orders.map((o) => [
        o.orderNumber,
        o.name,
        o.memberNumber ?? '',
        o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', '),
        (o.totalCents / 100).toFixed(2),
        o.status === 'PAID' ? (nl ? 'ja' : 'yes') : nl ? 'bij afhalen' : 'at pickup',
        o.collectedAt ? (nl ? 'ja' : 'yes') : '',
      ]),
    },
  ]);
}
