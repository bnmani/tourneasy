import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { apiPost } from '@/lib/api';

/** One tap, as the server expects it. `seq` orders the events within a match. */
export type QueuedEvent =
  | { id: string; seq: number; kind: 'POINT'; side: 'A' | 'B' }
  | { id: string; seq: number; kind: 'UNDO' };

export type FlushResult = { sent: number; remaining: number };

const keyFor = (matchId: string) => `score-queue:${matchId}`;

/** A new client-generated event id. */
export function newEventId(): string {
  return randomUUID();
}

// Reads and writes of one match's list run one at a time, so two taps never overwrite each other.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function read(matchId: string): Promise<QueuedEvent[]> {
  const raw = await AsyncStorage.getItem(keyFor(matchId));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as QueuedEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function write(matchId: string, list: QueuedEvent[]): Promise<void> {
  if (list.length === 0) await AsyncStorage.removeItem(keyFor(matchId));
  else await AsyncStorage.setItem(keyFor(matchId), JSON.stringify(list));
}

/** Saves the tap to storage. It resolves only after the write, so a point is never memory-only. */
export function enqueue(matchId: string, event: QueuedEvent): Promise<void> {
  return exclusive(async () => {
    const list = await read(matchId);
    if (list.some((e) => e.id === event.id)) return;
    list.push(event);
    list.sort((a, b) => a.seq - b.seq);
    await write(matchId, list);
  });
}

/** Events not yet acknowledged by the server, in seq order. Storage is async, so this is too. */
export function pending(matchId: string): Promise<QueuedEvent[]> {
  return exclusive(() => read(matchId));
}

/** Finishing is allowed only when nothing is waiting to be sent. */
export async function canFinish(matchId: string): Promise<boolean> {
  return (await pending(matchId)).length === 0;
}

/**
 * Sends pending events one at a time in seq order. An event leaves storage only after the server
 * answers 2xx. The first failure stops the flush so later events are never sent ahead of it.
 */
export async function flush(matchId: string, token: string): Promise<FlushResult> {
  let sent = 0;
  for (;;) {
    const [next] = await pending(matchId);
    if (!next) return { sent, remaining: 0 };
    try {
      await apiPost(`/api/v1/umpire/matches/${matchId}/events`, { events: [next] }, token);
    } catch {
      return { sent, remaining: (await pending(matchId)).length };
    }
    await exclusive(async () => {
      const list = await read(matchId);
      await write(
        matchId,
        list.filter((e) => e.id !== next.id),
      );
    });
    sent += 1;
  }
}
