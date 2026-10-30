import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { FakeGateway, setGatewayForTests } from '../payments/gateway';
import {
  foodAllowed,
  foodMenu,
  foodOrders,
  markCollected,
  placeFoodOrder,
  refundFoodOrder,
  saveFoodItem,
  saveFoodSettings,
  setFoodAccess,
} from './food-service';
import { handleWebhook } from './payment-service';
import {
  assertPackageToOpen,
  buyPackage,
  effectiveMaxParticipants,
  ownerMarkPaid,
  publicPricing,
  saveClubDiscount,
  savePricing,
  applyBundleCredit,
} from './pricing-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(resetDatabase);
afterEach(() => setGatewayForTests(undefined));

async function person(role?: Role, overrides: Record<string, unknown> = {}) {
  const p = await createPlayer(overrides);
  if (role) await prisma.userRole.create({ data: { userId: p.userId, role } });
  const actor = (await actorFromWebToken((await createWebSession(p.userId, meta, true)).token))!;
  const profile = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: p.userId } });
  return { ...p, actor, profile };
}

async function tournament(organiserId?: string, slug = 'almere-open') {
  return prisma.tournament.create({
    data: {
      name: 'Almere Open',
      slug,
      isPublished: true,
      startsOn: new Date('2027-03-13'),
      endsOn: new Date('2027-03-13'),
      registrationOpensAt: new Date('2026-01-01'),
      registrationClosesAt: new Date('2027-03-01'),
      entryDeadline: new Date('2027-03-01'),
      withdrawalDeadline: new Date('2027-03-01'),
      ...(organiserId ? { organisers: { create: { userId: organiserId } } } : {}),
    },
  });
}

const plans = (enabled: boolean, onlinePayment = false) => ({
  enabled,
  onlinePayment,
  plans: [
    { key: 'FREE', price: '0', maxPlayers: '16', visible: true },
    { key: 'STANDARD', price: '29', maxPlayers: '64', visible: true },
    { key: 'PRO', price: '59', maxPlayers: '', visible: true },
    { key: 'BUNDLE', price: '199', maxPlayers: '', visible: true, credits: 5 },
    { key: 'CLUB', price: '199', maxPlayers: '', visible: false },
  ],
  company: {
    name: 'Tourneasy',
    address: 'Almere',
    kvk: '1',
    vatNumber: 'NL1',
    email: 'a@b.c',
    iban: '',
  },
});

describe('pricing (D87)', () => {
  it('does nothing until the owner switches it on', async () => {
    const owner = await person(Role.OWNER);
    const admin = await person(Role.ADMIN);
    const t = await tournament();
    expect(await publicPricing(null)).toBeNull();
    await expect(assertPackageToOpen(t)).resolves.toBeUndefined();
    expect(
      await effectiveMaxParticipants({ maxParticipants: null, packageKey: 'FREE' }),
    ).toBeNull();
    await expect(
      buyPackage(owner.actor, { packageKey: 'PRO', tournamentId: t.id }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    // Admins can't change prices; owners can.
    await expect(savePricing(admin.actor, plans(true), meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    await savePricing(owner.actor, plans(true), meta);
    await expect(assertPackageToOpen(t)).rejects.toMatchObject({ code: 'packageRequired' });
    expect(await effectiveMaxParticipants({ maxParticipants: null, packageKey: 'FREE' })).toBe(16);
    expect(await effectiveMaxParticipants({ maxParticipants: 10, packageKey: 'STANDARD' })).toBe(
      10,
    );
  });

  it('applies a club discount, sells by invoice and numbers invoices', async () => {
    const owner = await person(Role.OWNER);
    await savePricing(owner.actor, plans(true, false), meta);
    const club = await prisma.club.create({ data: { name: 'BC Almere', slug: 'bc-almere' } });
    await saveClubDiscount(owner.actor, { clubId: club.id, percent: '20', code: 'almere20' }, meta);
    const org = await person(Role.ORGANISER);
    await prisma.playerProfile.update({ where: { id: org.profile.id }, data: { clubId: club.id } });
    const t = await tournament(org.userId);

    const page = await publicPricing(org.actor);
    expect(page!.discount).toMatchObject({ percent: 20, clubName: 'BC Almere' });
    expect(page!.plans.find((p) => p.key === 'STANDARD')!.quote).toMatchObject({
      netCents: 2320,
      vatCents: 487,
      totalCents: 2807,
    });

    // Online payment off: a request for an invoice; the owner marks it paid.
    const res = await buyPackage(org.actor, { packageKey: 'STANDARD', tournamentId: t.id }, meta);
    expect(res.kind).toBe('requested');
    await ownerMarkPaid(owner.actor, (res as { purchaseId: string }).purchaseId, meta);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.packageKey).toBe('STANDARD');
    const p = await prisma.packagePurchase.findFirstOrThrow();
    expect(p.invoiceNumber).toMatch(/^TE-\d{4}-0001$/);
    await expect(assertPackageToOpen(after)).resolves.toBeUndefined();
  });

  it('pays online, and a bundle gives Pro credits', async () => {
    const gateway = new FakeGateway();
    setGatewayForTests(gateway);
    const owner = await person(Role.OWNER);
    await savePricing(owner.actor, plans(true, true), meta);
    const org = await person(Role.ORGANISER);
    const t = await tournament(org.userId);

    const res = await buyPackage(org.actor, { packageKey: 'BUNDLE' }, meta);
    expect(res.kind).toBe('pay');
    const purchase = await prisma.packagePurchase.findFirstOrThrow();
    const intent = gateway.pay(purchase.stripePaymentIntentId!);
    await handleWebhook(
      JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', intent, raw: {} }),
      'valid',
    );
    expect((await prisma.packagePurchase.findFirstOrThrow()).status).toBe('PAID');
    await applyBundleCredit(org.actor, t.id, meta);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).packageKey).toBe(
      'PRO',
    );
    // Free can't be chosen for a tournament with more entries than it allows.
    await expect(
      buyPackage(org.actor, { packageKey: 'FREE', tournamentId: t.id }, meta),
    ).resolves.toMatchObject({ kind: 'done' });
  });
});

describe('food ordering (D87)', () => {
  async function setup() {
    const owner = await person(Role.OWNER);
    const org = await person(Role.ORGANISER);
    const player = await person();
    const other = await person();
    const t = await tournament(org.userId);
    const event = await prisma.tournamentEvent.create({
      data: { tournamentId: t.id, discipline: 'DE', feeCents: 0 },
    });
    await prisma.registration.create({
      data: {
        eventId: event.id,
        status: 'CONFIRMED',
        participants: {
          create: {
            eventId: event.id,
            playerId: player.profile.id,
            role: 'PRIMARY',
            checkInToken: 'x1',
          },
        },
      },
    });
    return { owner, org, player, other, t };
  }
  const toUtc = (local: string) => new Date(`${local}:00Z`);

  it('is only there when the owner allows it, with allergens, stock and a deadline', async () => {
    const { owner, org, player, other, t } = await setup();
    expect(await foodAllowed(t.id)).toBe(false);
    await expect(
      saveFoodItem(
        org.actor,
        t.id,
        null,
        { name: 'Roll', price: '3,50', allergens: ['gluten'] },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'foodUnavailable' });
    // Per tournament: the same organiser's other tournament stays without food.
    const other2 = await tournament(org.userId, 'almere-autumn');
    await expect(setFoodAccess(org.actor, t.id, true, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    await setFoodAccess(owner.actor, t.id, true, meta);
    expect(await foodAllowed(t.id)).toBe(true);
    expect(await foodAllowed(other2.id)).toBe(false);

    // Allergen information is required ("contains none" counts).
    await expect(
      saveFoodItem(org.actor, t.id, null, { name: 'Roll', price: '3,50' }, meta),
    ).rejects.toMatchObject({ details: { fields: { allergens: 'allergensRequired' } } });
    await saveFoodItem(
      org.actor,
      t.id,
      null,
      { name: 'Roll', price: '3,50', allergens: ['gluten', 'milk'], maxQuantity: '2' },
      meta,
    );
    await saveFoodItem(
      org.actor,
      t.id,
      null,
      { name: 'Water', price: '1', noAllergens: true },
      meta,
    );
    await saveFoodSettings(
      org.actor,
      t.id,
      { on: true, cutoffAt: '2099-01-01T20:00', pickupInfo: 'Canteen' },
      meta,
      toUtc,
    );

    const menu = (await foodMenu(player.actor, t.slug))!;
    expect(menu.open).toBe(true);
    expect(menu.canOrder).toBe(true);
    const [roll, water] = menu.items;
    const line = (itemId: string, quantity: number) => ({ lines: [{ itemId, quantity }] });

    // Only players in the tournament; never more than the stock.
    await expect(
      placeFoodOrder(other.actor, t.slug, line(roll!.id, 1), meta),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      placeFoodOrder(player.actor, t.slug, line(roll!.id, 3), meta),
    ).rejects.toMatchObject({
      code: 'foodSoldOut',
    });
    // No online payment set up: placed, to pay at pickup.
    const placed = await placeFoodOrder(
      player.actor,
      t.slug,
      {
        lines: [
          { itemId: roll!.id, quantity: 2 },
          { itemId: water!.id, quantity: 1 },
        ],
      },
      meta,
    );
    expect(placed.kind).toBe('placed');
    expect((await foodMenu(player.actor, t.slug))!.items[0]!.left).toBe(0);

    const list = await foodOrders(org.actor, t.id);
    expect(list.totals).toEqual([
      { name: 'Roll', quantity: 2, collected: 0 },
      { name: 'Water', quantity: 1, collected: 0 },
    ]);
    await markCollected(org.actor, t.id, placed.orderId, meta);
    const done = await prisma.foodOrder.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(done.status).toBe('PAID'); // paid at pickup
    expect(done.totalCents).toBe(800);

    // After the deadline nobody orders any more.
    await prisma.tournament.update({
      where: { id: t.id },
      data: { foodCutoffAt: new Date('2020-01-01') },
    });
    await expect(
      placeFoodOrder(player.actor, t.slug, line(water!.id, 1), meta),
    ).rejects.toMatchObject({
      code: 'foodClosed',
    });
  });

  it('pays online and refunds in full', async () => {
    const gateway = new FakeGateway();
    setGatewayForTests(gateway);
    const { owner, org, player, t } = await setup();
    await setFoodAccess(owner.actor, t.id, true, meta);
    await saveFoodItem(
      org.actor,
      t.id,
      null,
      { name: 'Satay', price: '8,50', allergens: ['peanuts'] },
      meta,
    );
    await saveFoodSettings(
      org.actor,
      t.id,
      { on: true, cutoffAt: '2099-01-01T20:00' },
      meta,
      toUtc,
    );
    const item = (await foodMenu(player.actor, t.slug))!.items[0]!;
    const res = await placeFoodOrder(
      player.actor,
      t.slug,
      { lines: [{ itemId: item.id, quantity: 1 }] },
      meta,
    );
    expect(res).toMatchObject({ kind: 'pay', totalCents: 850 });
    const order = await prisma.foodOrder.findFirstOrThrow();
    const intent = gateway.pay(order.stripePaymentIntentId!);
    await handleWebhook(
      JSON.stringify({ id: 'evt_f', type: 'payment_intent.succeeded', intent, raw: {} }),
      'valid',
    );
    expect((await prisma.foodOrder.findFirstOrThrow()).status).toBe('PAID');
    await refundFoodOrder(org.actor, t.id, order.id, meta);
    expect((await prisma.foodOrder.findFirstOrThrow()).status).toBe('REFUNDED');
  });
});
