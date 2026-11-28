import { ApiError, apiGet, apiPost, apiSend } from '@/lib/api';

const del = <T,>(path: string, token: string) =>
  apiSend<T>('DELETE', path, undefined, token) as Promise<T>;

export type CourtItem = {
  id: string;
  number: number;
  name: string | null;
  status: 'FREE' | 'HELD' | 'HELD_BY_ME';
  holderName: string | null;
  /** The court's current match; the website sends no player names to the phone. */
  match: { id: string; status: string; round: number; matchNumber: number } | null;
};

export type TakeoverCreated = { id: string; courtId: string; status: string; expiresAt: string };

const base = '/api/v1/umpire';

export const fetchCourts = (token: string) =>
  apiGet<{ courts: CourtItem[] }>(`${base}/courts`, undefined, token).then((r) => r.courts);

export const claimCourt = (token: string, courtId: string) =>
  apiPost<{ ok: true }>(`${base}/courts/${courtId}/claim`, {}, token);

export const releaseCourt = (token: string, courtId: string) =>
  del<{ ok: true }>(`${base}/courts/${courtId}/claim`, token);

export const startMatch = (token: string, matchId: string, serving: 'A' | 'B') =>
  apiPost<{ ok: true }>(`${base}/matches/${matchId}/start`, { serving }, token);

export const finishMatch = (token: string, matchId: string) =>
  apiPost<{ status: string; games: [number, number][] }>(
    `${base}/matches/${matchId}/finish`,
    {},
    token,
  );

export const requestTakeover = (token: string, courtId: string) =>
  apiPost<TakeoverCreated>(`${base}/takeovers`, { courtId }, token);

export const answerTakeover = (token: string, requestId: string, answer: 'ACCEPT' | 'DECLINE') =>
  apiPost<{ ok: true }>(`${base}/takeovers/${requestId}/answer`, { answer }, token);

/** True when the server said the session is no longer valid (sign in again). */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
