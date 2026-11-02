import { prisma, Role } from '@tourneasy/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, meta, resetDatabase } from '@/test/db';
import { FakeGateway, setGatewayForTests } from '../payments/gateway';
import {
  addDeskOrder,
  foodAllowed,
  foodOrderingOpen,
  foodMenu,
  foodOrders,
  markCollected,
  undoCollected,
  placeFoodOrder,
  refundFoodOrder,
  saveFoodItem,
  saveFoodSettings,
  setFoodAccess,
  undoDeskFoodPaid,
  updateDeskOrder,
} from './food-service';
import { handleWebhook } from './payment-service';
import {
  assertPackageToOpen,
  buyPackage,
  clearPricingCache,
  effectiveMaxParticipants,
  givePackage,
  ownerMarkPaid,
  publicPricing,
  saveClubDiscount,
  savePricing,
  applyBundleCredit,
  tournamentPackage,
} from './pricing-service';
import { actorFromWebToken, createWebSession } from './session-service';

beforeEach(async () => {
  clearPricingCache();
  await resetDatabase();
});
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
      // Packages apply to external organisers' tournaments; own ones never need one (D103).
      type: 'THIRD_PARTY',
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
      await effectiveMaxParticipants({
        type: 'THIRD_PARTY',
        maxParticipants: null,
        packageKey: 'FREE',
      }),
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
    expect(
      await effectiveMaxParticipants({
        type: 'THIRD_PARTY',
        maxParticipants: null,
        packageKey: 'FREE',
      }),
    ).toBe(16);
    expect(
      await effectiveMaxParticipants({
        type: 'THIRD_PARTY',
        maxParticipants: 10,
        packageKey: 'STANDARD',
      }),
    ).toBe(10);
  });

  it('leaves own tournaments alone, shows admins the card without Pay, lets the owner give (D103)', async () => {
    const owner = await person(Role.OWNER);
    const admin = await person(Role.ADMIN);
    const org = await person(Role.ORGANISER);
    await savePricing(owner.actor, plans(true), meta);

    // Own tournament: no package needed, no cap from a package, no card.
    const own = await prisma.tournament.update({
      where: { id: (await tournament(undefined, 'own-open')).id },
      data: { type: 'SELF' },
    });
    await expect(assertPackageToOpen(own)).resolves.toBeUndefined();
    expect(
      await effectiveMaxParticipants({ type: 'SELF', maxParticipants: null, packageKey: 'FREE' }),
    ).toBeNull();
    expect(await tournamentPackage(owner.actor, own.id)).toBeNull();

    // Organiser's tournament: the organiser pays; admins and the owner only look.
    const t = await tournament(org.userId);
    expect(await tournamentPackage(org.actor, t.id)).toMatchObject({
      canPay: true,
      canGive: false,
    });
    expect(await tournamentPackage(admin.actor, t.id)).toMatchObject({
      canPay: false,
      canGive: false,
    });
    expect(await tournamentPackage(owner.actor, t.id)).toMatchObject({
      canPay: false,
      canGive: true,
    });

    // Only the owner gives; giving another package is the way back, each one in the log.
    await expect(
      givePackage(admin.actor, { tournamentId: t.id, packageKey: 'PRO' }, meta),
    ).rejects.toBeDefined();
    await givePackage(owner.actor, { tournamentId: t.id, packageKey: 'PRO' }, meta);
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).packageKey).toBe(
      'PRO',
    );
    await givePackage(owner.actor, { tournamentId: t.id, packageKey: 'STANDARD' }, meta);
    const after = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ packageKey: 'STANDARD', packagePurchaseId: null });
    const log = await prisma.auditLog.findMany({
      where: { action: 'pricing.packageGiven', entityId: t.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(log.map((l) => (l.after as { packageKey: string }).packageKey)).toEqual([
      'PRO',
      'STANDARD',
    ]);
    expect(await prisma.packagePurchase.count()).toBe(0);
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
    // A second request for the same tournament waits for the first.
    await expect(
      buyPackage(org.actor, { packageKey: 'PRO', tournamentId: t.id }, meta),
    ).rejects.toMatchObject({ code: 'purchasePending' });
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

    const abandoned = await buyPackage(org.actor, { packageKey: 'BUNDLE' }, meta);
    expect(abandoned.kind).toBe('pay');
    // Trying again cancels the unfinished payment instead of opening a second one.
    const res = await buyPackage(org.actor, { packageKey: 'BUNDLE' }, meta);
    expect(res.kind).toBe('pay');
    expect(
      await prisma.packagePurchase.count({ where: { status: { in: ['PENDING', 'REQUESTED'] } } }),
    ).toBe(1);
    const purchase = await prisma.packagePurchase.findFirstOrThrow({
      where: { status: 'PENDING' },
    });
    const intent = gateway.pay(purchase.stripePaymentIntentId!);
    await handleWebhook(
      JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', intent, raw: {} }),
      'valid',
    );
    expect(
      (await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status,
    ).toBe('PAID');
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
    // Handed out by mistake (D99): to hand out again, and unpaid again (paid at pickup).
    await undoCollected(org.actor, t.id, placed.orderId, meta);
    expect(
      await prisma.foodOrder.findUniqueOrThrow({ where: { id: placed.orderId } }),
    ).toMatchObject({ collectedAt: null, status: 'PENDING', paidAt: null });
    await expect(undoCollected(org.actor, t.id, placed.orderId, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    await markCollected(org.actor, t.id, placed.orderId, meta);

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

  it('lets staff order, and the desk add, change, unpay and cancel guest orders (D107)', async () => {
    const { owner, org, player, other, t } = await setup();
    const otherOrg = await person(Role.ORGANISER);
    await setFoodAccess(owner.actor, t.id, true, meta);
    await saveFoodItem(
      org.actor,
      t.id,
      null,
      { name: 'Roll', price: '3,50', noAllergens: true, maxQuantity: '3' },
      meta,
    );
    await saveFoodSettings(
      org.actor,
      t.id,
      { on: true, cutoffAt: '2099-01-01T20:00' },
      meta,
      toUtc,
    );
    const roll = (await foodMenu(player.actor, t.slug))!.items[0]!;
    const one = { lines: [{ itemId: roll.id, quantity: 1 }] };

    // A: the tournament's organisers and the owner order like players; others still can't.
    expect((await foodMenu(org.actor, t.slug))!.canOrder).toBe(true);
    expect((await foodMenu(otherOrg.actor, t.slug))!.canOrder).toBe(false);
    await placeFoodOrder(org.actor, t.slug, one, meta);
    await expect(placeFoodOrder(other.actor, t.slug, one, meta)).rejects.toMatchObject({
      code: 'forbidden',
    });

    // B: a desk order for a guest, after the deadline too; stock still counts.
    await prisma.tournament.update({
      where: { id: t.id },
      data: { foodCutoffAt: new Date('2020-01-01') },
    });
    const two = [{ itemId: roll.id, quantity: 2 }];
    await expect(
      addDeskOrder(
        org.actor,
        t.id,
        { name: 'Ref', lines: [{ itemId: roll.id, quantity: 3 }] },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'foodSoldOut' });
    await expect(
      addDeskOrder(otherOrg.actor, t.id, { name: 'Ref', lines: two }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    const deskId = await addDeskOrder(
      org.actor,
      t.id,
      { name: 'Anna (referee)', note: 'court 3', lines: two },
      meta,
    );
    const list = await foodOrders(org.actor, t.id);
    expect(list.orders.map((o) => [o.name, o.desk, o.staff])).toEqual([
      [expect.any(String), false, true],
      ['Anna (referee)', true, false],
    ]);
    expect(list.orders[1]).toMatchObject({ note: 'court 3', memberNumber: null });
    // The organiser's own order list on the menu doesn't include the guest's order.
    expect((await foodMenu(org.actor, t.slug))!.orders).toHaveLength(1);

    // Change: its own portions are free to it, others' aren't.
    await updateDeskOrder(org.actor, t.id, deskId, { name: 'Anna', lines: two }, meta);
    await expect(
      updateDeskOrder(
        org.actor,
        t.id,
        deskId,
        { name: 'Anna', lines: [{ itemId: roll.id, quantity: 3 }] },
        meta,
      ),
    ).rejects.toMatchObject({ code: 'foodSoldOut' });
    expect(await prisma.foodOrder.findUniqueOrThrow({ where: { id: deskId } })).toMatchObject({
      guestName: 'Anna',
      guestNote: null,
      totalCents: 700,
    });

    // Cancel frees the stock.
    await refundFoodOrder(org.actor, t.id, deskId, meta);
    expect((await prisma.foodOrder.findUniqueOrThrow({ where: { id: deskId } })).status).toBe(
      'CANCELLED',
    );

    // Paid now, by mistake: undo it; then it can be changed again.
    const paidId = await addDeskOrder(
      org.actor,
      t.id,
      { name: 'Guest', lines: two, paid: true },
      meta,
    );
    await expect(
      updateDeskOrder(org.actor, t.id, paidId, { name: 'Guest', lines: two }, meta),
    ).rejects.toMatchObject({ code: 'notFound' });
    await undoDeskFoodPaid(org.actor, t.id, paidId, meta);
    expect(await prisma.foodOrder.findUniqueOrThrow({ where: { id: paidId } })).toMatchObject({
      status: 'PENDING',
      paidAt: null,
    });
    // Paid at pickup with the hand-out, as other orders.
    await markCollected(org.actor, t.id, paidId, meta);
    await expect(undoDeskFoodPaid(org.actor, t.id, paidId, meta)).rejects.toMatchObject({
      code: 'notFound',
    });
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'food.desk' } } })).toBe(4);
  });

  it('switching food off closes ordering, unless Pro still includes it', async () => {
    const { owner, org, t } = await setup();
    await setFoodAccess(owner.actor, t.id, true, meta);
    await saveFoodSettings(
      org.actor,
      t.id,
      { on: true, cutoffAt: '2099-01-01T20:00' },
      meta,
      toUtc,
    );
    expect(await foodOrderingOpen(t.slug)).toBe(true);

    await savePricing(owner.actor, plans(true), meta);
    await prisma.tournament.update({ where: { id: t.id }, data: { packageKey: 'PRO' } });
    await setFoodAccess(owner.actor, t.id, false, meta);
    expect(await foodOrderingOpen(t.slug)).toBe(true);

    await prisma.tournament.update({ where: { id: t.id }, data: { packageKey: 'STANDARD' } });
    await setFoodAccess(owner.actor, t.id, false, meta);
    expect(await foodOrderingOpen(t.slug)).toBe(false);
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
