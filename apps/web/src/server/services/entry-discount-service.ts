/**
 * Entry fee discount codes (D111). The owner makes them: a percentage (100 = free), for one
 * tournament or all, optionally limited in uses and time. A player uses a code once; it works
 * at online checkout and at the desk. Switching a code off stops new uses; payments already
 * made with it stay as they are (refund them the usual way).
 */
import { type OrderStatus, Prisma, prisma } from '@tourneasy/db';
import { z } from 'zod';
import { writeAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import type { RequestMeta } from '../lib/request-meta';
import { parseInput } from '../lib/validation';
import { assertOwner } from './permissions';
import type { Actor } from './session-service';

type Db = Prisma.TransactionClient | typeof prisma;

const USED: OrderStatus[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'tooShort')
    .max(30, 'tooLong')
    .regex(/^[A-Za-z0-9-]+$/, 'invalid'),
  percent: z.coerce.number().int('invalid').min(1, 'invalid').max(100, 'invalid'),
  tournamentId: z.preprocess(emptyToUndefined, z.string().uuid('invalid').optional()),
  maxUses: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(10_000).optional()),
  validUntil: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid')
      .optional(),
  ),
  note: z.preprocess(emptyToUndefined, z.string().trim().max(120, 'tooLong').optional()),
});

/** The amount after a percentage discount (rounded to whole cents). */
export function discounted(amountCents: number, percent: number): number {
  return amountCents - Math.round((amountCents * percent) / 100);
}

/**
 * Checks a code for this tournament and player: on, in time, not used up, and not used by
 * this player before.
 */
export async function resolveCode(
  raw: string,
  tournamentId: string,
  playerId: string,
  now = new Date(),
  db: Db = prisma,
) {
  const code = await db.entryDiscountCode.findUnique({ where: { code: raw.trim() } });
  if (
    !code ||
    !code.active ||
    (code.tournamentId && code.tournamentId !== tournamentId) ||
    (code.validUntil && code.validUntil.getTime() + 86_400_000 <= now.getTime())
  )
    throw new AppError('codeInvalid');
  if (code.maxUses !== null) {
    const uses = await db.order.count({
      where: { discountCodeId: code.id, status: { in: USED } },
    });
    if (uses >= code.maxUses) throw new AppError('codeInvalid');
  }
  const mine = await db.order.count({
    where: {
      discountCodeId: code.id,
      status: { in: USED },
      items: { some: { participant: { playerId } } },
    },
  });
  if (mine > 0) throw new AppError('codeUsed');
  return { id: code.id, percent: code.percent };
}

/** Owner: every code with its uses and the total discount given. */
export async function listDiscountCodes(actor: Actor) {
  assertOwner(actor);
  const [codes, totals] = await Promise.all([
    prisma.entryDiscountCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { tournament: { select: { name: true } } },
    }),
    prisma.order.groupBy({
      by: ['discountCodeId'],
      where: { discountCodeId: { not: null }, status: { in: USED } },
      _count: { _all: true },
      _sum: { discountCents: true },
    }),
  ]);
  const by = new Map(totals.map((t) => [t.discountCodeId, t]));
  return codes.map((c) => ({
    ...c,
    uses: by.get(c.id)?._count._all ?? 0,
    discountCents: by.get(c.id)?._sum.discountCents ?? 0,
  }));
}

export async function createDiscountCode(actor: Actor, input: unknown, meta: RequestMeta) {
  assertOwner(actor);
  const data = parseInput(codeSchema, input);
  try {
    const code = await prisma.entryDiscountCode.create({
      data: {
        code: data.code.toUpperCase(),
        percent: data.percent,
        tournamentId: data.tournamentId ?? null,
        maxUses: data.maxUses ?? null,
        validUntil: data.validUntil ? new Date(`${data.validUntil}T00:00:00Z`) : null,
        note: data.note ?? null,
        createdById: actor.userId,
      },
    });
    await writeAudit(prisma, {
      actorId: actor.userId,
      action: 'discountCode.create',
      entityType: 'EntryDiscountCode',
      entityId: code.id,
      after: { code: code.code, percent: code.percent, tournamentId: code.tournamentId },
      meta,
    });
    return code;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new AppError('validation', { fields: { code: 'taken' } });
    throw error;
  }
}

/** Switches a code off (no new uses) or on again. */
export async function setDiscountCodeActive(
  actor: Actor,
  id: string,
  active: boolean,
  meta: RequestMeta,
) {
  assertOwner(actor);
  const code = await prisma.entryDiscountCode.update({ where: { id }, data: { active } });
  await writeAudit(prisma, {
    actorId: actor.userId,
    action: active ? 'discountCode.on' : 'discountCode.off',
    entityType: 'EntryDiscountCode',
    entityId: id,
    after: { code: code.code },
    meta,
  });
}
