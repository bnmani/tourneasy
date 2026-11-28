import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiGet } from '@/lib/api';
import { seedSeq } from '@/lib/seq-counter';

export type MatchState = {
  status: string;
  version: number;
  games: [number, number][];
  serving: 'A' | 'B';
  lastSeq: number;
  /** The serve choice stored on the server, or null while none was made. */
  umpireStartServer?: 'A' | 'B' | null;
};

const key = (matchId: string) => `match-state:${matchId}`;

/** The last score the server told this phone about (what the screens show). */
export async function readMatchState(matchId: string): Promise<MatchState | null> {
  const raw = await AsyncStorage.getItem(key(matchId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as MatchState;
    return Array.isArray(value.games) ? value : null;
  } catch {
    return null;
  }
}

/** Stores a server reply (match state or events response) as the match's current state. */
export async function recordServerState(matchId: string, reply: unknown): Promise<void> {
  const r = reply as Partial<MatchState> | null;
  if (!r || !Array.isArray(r.games) || (r.serving !== 'A' && r.serving !== 'B')) return;
  const before = await readMatchState(matchId);
  const next: MatchState = {
    status: r.status ?? before?.status ?? 'IN_PROGRESS',
    version: typeof r.version === 'number' ? r.version : (before?.version ?? 0),
    games: r.games,
    serving: r.serving,
    lastSeq: typeof r.lastSeq === 'number' ? r.lastSeq : (before?.lastSeq ?? 0),
    umpireStartServer:
      r.umpireStartServer === undefined ? before?.umpireStartServer : r.umpireStartServer,
  };
  await AsyncStorage.setItem(key(matchId), JSON.stringify(next));
  await seedSeq(matchId, next.lastSeq);
}

/**
 * Reads the match from the server, stores it, and lifts the seq counter to the server's highest
 * seq. Call it when a match screen opens and before the first tap.
 */
export async function loadMatchState(matchId: string, token: string): Promise<MatchState> {
  const reply = await apiGet<MatchState>(`/api/v1/umpire/matches/${matchId}`, undefined, token);
  await recordServerState(matchId, reply);
  return (await readMatchState(matchId)) ?? reply;
}
