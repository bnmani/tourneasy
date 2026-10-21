import { describe, expect, it } from 'vitest';
import { proposeSchedule, restConflicts, type ScheduleMatch } from './schedule';

const day = (h1: number, h2: number) => ({
  start: new Date(Date.UTC(2027, 2, 13, h1)),
  end: new Date(Date.UTC(2027, 2, 13, h2)),
});
const m = (id: string, players: string[], extra: Partial<ScheduleMatch> = {}): ScheduleMatch => ({
  id,
  eventOrder: 0,
  bracket: 'W',
  round: 1,
  number: Number(id.replace(/\D/g, '')) || 0,
  players,
  feeders: [],
  restMinutes: 20,
  ...extra,
});
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

describe('schedule proposal', () => {
  it('fills courts and keeps a player from playing twice without rest', () => {
    const { slots, unscheduled } = proposeSchedule({
      matches: [m('m1', ['a', 'b']), m('m2', ['c', 'd']), m('m3', ['a', 'c']), m('m4', ['e', 'f'])],
      courts: ['c1', 'c2'],
      days: [day(9, 12)],
      matchMinutes: 30,
    });
    expect(unscheduled).toEqual([]);
    const at = Object.fromEntries(slots.map((s) => [s.matchId, hhmm(s.start)]));
    expect(at).toMatchObject({ m1: '09:00', m2: '09:00', m4: '09:30' });
    // m3 needs a and c rested 20 minutes after 09:30 → the 10:00 slot.
    expect(at.m3).toBe('10:00');
  });

  it('schedules a knockout round only after its feeders plus rest', () => {
    const { slots } = proposeSchedule({
      matches: [
        m('m1', ['a', 'b']),
        m('m2', ['c', 'd']),
        m('m3', [], { round: 2, feeders: ['m1', 'm2'] }),
      ],
      courts: ['c1', 'c2', 'c3'],
      days: [day(9, 12)],
      matchMinutes: 30,
    });
    expect(hhmm(slots.find((s) => s.matchId === 'm3')!.start)).toBe('10:00');
  });

  it('moves to the next day and reports what does not fit', () => {
    const matches = Array.from({ length: 5 }, (_, i) => m(`m${i + 1}`, [`p${i}`, `q${i}`]));
    const { slots, unscheduled } = proposeSchedule({
      matches,
      courts: ['c1'],
      days: [
        day(9, 10),
        { start: new Date(Date.UTC(2027, 2, 14, 9)), end: new Date(Date.UTC(2027, 2, 14, 10)) },
      ],
      matchMinutes: 30,
    });
    expect(slots).toHaveLength(4);
    expect(slots[2]!.start.toISOString()).toBe('2027-03-14T09:00:00.000Z');
    expect(unscheduled).toEqual(['m5']);
  });

  it('keeps fixed slots and plans around them', () => {
    const { slots } = proposeSchedule({
      matches: [m('m2', ['a', 'c'])],
      courts: ['c1'],
      days: [day(9, 12)],
      matchMinutes: 30,
      fixed: [
        {
          matchId: 'm1',
          court: 'c1',
          start: day(9, 9).start,
          end: new Date(Date.UTC(2027, 2, 13, 9, 30)),
          players: ['a', 'b'],
        },
      ],
    });
    expect(hhmm(slots[0]!.start)).toBe('10:00');
  });

  it('finds rest conflicts after manual changes', () => {
    const t = (h: number, min = 0) => new Date(Date.UTC(2027, 2, 13, h, min));
    expect(
      restConflicts([
        { matchId: 'm1', start: t(9), end: t(9, 30), players: ['a'], restMinutes: 20 },
        { matchId: 'm2', start: t(9, 40), end: t(10, 10), players: ['a'], restMinutes: 20 },
      ]),
    ).toEqual([{ matchId: 'm2', player: 'a' }]);
  });
});
