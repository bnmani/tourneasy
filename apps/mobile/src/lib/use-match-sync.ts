import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { readMatchState, type MatchState } from '@/lib/match-state';
import {
  canFinish,
  corruptCount,
  flush,
  pending,
  rejectedEvents,
  type BlockedInfo,
  type RejectedEvent,
} from '@/lib/score-queue';
import { blockedAction, type BlockedAction } from '@/lib/umpire-sync';

const RETRY_MS = 8000;

export type MatchSync = {
  loaded: boolean;
  waiting: number;
  rejected: RejectedEvent[];
  corrupt: number;
  finishable: boolean;
  /** The score as the server last reported it, or null before the first read. */
  score: MatchState | null;
  /** What the last failed send needs: sign in, the desk, or just the connection. */
  problem: BlockedAction | null;
  /** Reads the queue and tries to send what is waiting. */
  sync: () => Promise<void>;
  /** Reads the queue only. */
  refresh: () => Promise<void>;
};

/**
 * The queue state of one match for the screen, with automatic retry: a failed send is tried again
 * every few seconds and when the app comes back to the foreground, so points sync by themselves
 * when the connection returns. A 401 calls `onUnauthorized`; the taps stay on the phone.
 */
export function useMatchSync(
  matchId: string,
  token: string | null,
  onUnauthorized: () => void,
): MatchSync {
  const [state, setState] = useState({
    loaded: false,
    waiting: 0,
    rejected: [] as RejectedEvent[],
    corrupt: 0,
    finishable: false,
    score: null as MatchState | null,
  });
  const [problem, setProblem] = useState<BlockedAction | null>(null);
  const alive = useRef(true);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  });

  const refresh = useCallback(async () => {
    const [list, rejected, corrupt, finishable, score] = await Promise.all([
      pending(matchId),
      rejectedEvents(matchId),
      corruptCount(matchId),
      canFinish(matchId),
      readMatchState(matchId),
    ]);
    if (alive.current)
      setState({ loaded: true, waiting: list.length, rejected, corrupt, finishable, score });
  }, [matchId]);

  const sync = useCallback(async () => {
    if (token) {
      const result = await flush(matchId, token);
      const blocked: BlockedInfo | undefined = result.blocked;
      const action = blocked ? blockedAction(blocked) : null;
      if (alive.current) setProblem(action);
      if (action === 'signIn') unauthorized.current();
    }
    await refresh();
  }, [matchId, token, refresh]);

  useEffect(() => {
    alive.current = true;
    void sync();
    const timer = setInterval(() => void sync(), RETRY_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [sync]);

  return { ...state, problem, sync, refresh };
}
