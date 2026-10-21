import { describe, expect, it } from 'vitest';
import { amsterdamToday, tournamentPhase } from './tournament-phase';

const base = {
  status: 'OPEN',
  startsOn: new Date('2027-03-13T00:00:00Z'),
  endsOn: new Date('2027-03-14T00:00:00Z'),
  registrationOpensAt: new Date('2026-11-01T08:00:00Z'),
  registrationClosesAt: new Date('2027-02-27T22:59:00Z'),
};

describe('tournamentPhase', () => {
  it('follows the registration window and the tournament days', () => {
    expect(tournamentPhase(base, new Date('2026-10-01T12:00:00Z'))).toBe('registrationSoon');
    expect(tournamentPhase(base, new Date('2026-12-01T12:00:00Z'))).toBe('registrationOpen');
    expect(tournamentPhase(base, new Date('2027-03-01T12:00:00Z'))).toBe('registrationClosed');
    expect(tournamentPhase(base, new Date('2027-03-13T09:00:00Z'))).toBe('inProgress');
    expect(tournamentPhase(base, new Date('2027-03-15T09:00:00Z'))).toBe('finished');
  });

  it('only counts as open while the status is OPEN', () => {
    const closed = { ...base, status: 'CLOSED' };
    expect(tournamentPhase(closed, new Date('2026-12-01T12:00:00Z'))).toBe('registrationClosed');
    const finished = { ...base, status: 'FINISHED' };
    expect(tournamentPhase(finished, new Date('2026-12-01T12:00:00Z'))).toBe('finished');
  });

  it('uses the Dutch calendar day', () => {
    // 23:30 UTC on 12 March is already 13 March in Amsterdam.
    expect(amsterdamToday(new Date('2027-03-12T23:30:00Z'))).toBe('2027-03-13');
    expect(tournamentPhase(base, new Date('2027-03-12T23:30:00Z'))).toBe('inProgress');
  });
});
