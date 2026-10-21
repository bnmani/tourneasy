import { utcToAmsterdamLocal } from './time';

/** What a visitor should know about a tournament right now (badge on cards and pages). */
export const TOURNAMENT_PHASES = [
  'registrationSoon',
  'registrationOpen',
  'registrationClosed',
  'inProgress',
  'finished',
] as const;
export type TournamentPhase = (typeof TOURNAMENT_PHASES)[number];

type PhaseInput = {
  status: string;
  startsOn: Date;
  endsOn: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
};

/** Today's date in the Netherlands as "YYYY-MM-DD". */
export function amsterdamToday(now: Date = new Date()): string {
  return utcToAmsterdamLocal(now).slice(0, 10);
}

/** Tournament days are stored as UTC midnight dates; compare them as "YYYY-MM-DD". */
const day = (d: Date) => d.toISOString().slice(0, 10);

export function tournamentPhase(t: PhaseInput, now: Date = new Date()): TournamentPhase {
  const today = amsterdamToday(now);
  if (t.status === 'FINISHED' || t.status === 'ARCHIVED' || day(t.endsOn) < today) {
    return 'finished';
  }
  if (t.status === 'IN_PROGRESS' || day(t.startsOn) <= today) return 'inProgress';
  if (now < t.registrationOpensAt) return 'registrationSoon';
  if (t.status === 'OPEN' && now < t.registrationClosesAt) return 'registrationOpen';
  return 'registrationClosed';
}
