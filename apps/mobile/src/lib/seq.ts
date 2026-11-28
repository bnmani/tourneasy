import AsyncStorage from '@react-native-async-storage/async-storage';

import { enqueue, newEventId, type QueuedEvent } from '@/lib/score-queue';

const counterKey = (matchId: string) => `seq-counter:${matchId}`;
const logKey = (matchId: string) => `score-log:${matchId}`;

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * The next seq for this match. The counter lives in storage (per match), only increases, and is
 * written before the number is handed out, so a crash after this call never reuses it.
 */
export function nextSeq(matchId: string): Promise<number> {
  return exclusive(async () => {
    const raw = await AsyncStorage.getItem(counterKey(matchId));
    const last = Number.parseInt(raw ?? '0', 10);
    const next = (Number.isFinite(last) && last > 0 ? last : 0) + 1;
    await AsyncStorage.setItem(counterKey(matchId), String(next));
    return next;
  });
}

export type Tap = { kind: 'POINT'; side: 'A' | 'B' } | { kind: 'UNDO' };

/** What this phone shows on screen. The server's log stays the truth. */
export type LoggedTap = Tap;

export async function readTapLog(matchId: string): Promise<LoggedTap[]> {
  const raw = await AsyncStorage.getItem(logKey(matchId));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? (list as LoggedTap[]) : [];
  } catch {
    return [];
  }
}

/**
 * Takes the next seq (saved first), then saves the tap to the offline queue. Resolves only when
 * the tap is in storage, so a point is never memory-only.
 */
export async function recordTap(matchId: string, tap: Tap): Promise<QueuedEvent> {
  const seq = await nextSeq(matchId);
  const id = newEventId();
  const event: QueuedEvent =
    tap.kind === 'POINT' ? { id, seq, kind: 'POINT', side: tap.side } : { id, seq, kind: 'UNDO' };
  await enqueue(matchId, event);
  await exclusive(async () => {
    const log = await readTapLog(matchId);
    log.push(tap);
    await AsyncStorage.setItem(logKey(matchId), JSON.stringify(log));
  });
  return event;
}
