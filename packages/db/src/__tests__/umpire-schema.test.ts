import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

const models = Prisma.dmmf.datamodel.models;
const model = (name: string) => {
  const m = models.find((x) => x.name === name);
  if (!m) throw new Error(`model ${name} missing from the schema`);
  return m;
};
const enumValues = (name: string) =>
  Prisma.dmmf.datamodel.enums.find((e) => e.name === name)?.values.map((v) => v.name) ?? [];
// A field is unique on its own when it is @id, @unique, or the sole field of a @@unique.
const isUnique = (m: ReturnType<typeof model>, field: string) =>
  m.fields.some((f) => f.name === field && (f.isId || f.isUnique)) ||
  m.uniqueFields.some((u) => u.length === 1 && u[0] === field);

describe('umpire scoring schema', () => {
  it('UmpireEvent.id is unique (client uuid makes retries idempotent)', () => {
    expect(isUnique(model('UmpireEvent'), 'id')).toBe(true);
  });

  it('CourtHold.courtId is unique (one umpire per court)', () => {
    expect(isUnique(model('CourtHold'), 'courtId')).toBe(true);
  });

  it('Match.status accepts AWAITING_DESK', () => {
    expect(enumValues('MatchStatus')).toContain('AWAITING_DESK');
  });

  it('has the take-over and desk alert state values', () => {
    expect(enumValues('TakeoverStatus')).toEqual(['PENDING', 'ACCEPTED', 'DECLINED', 'TIMED_OUT']);
    expect(enumValues('DeskAlertStatus')).toEqual(['OPEN', 'RESOLVED']);
    expect(enumValues('UmpireEventKind')).toEqual(['POINT', 'UNDO']);
    expect(enumValues('UmpireSide')).toEqual(['A', 'B']);
  });

  it('keeps one event order per match', () => {
    expect(model('UmpireEvent').uniqueIndexes.some((u) => u.fields.join() === 'matchId,seq')).toBe(
      true,
    );
  });
});
