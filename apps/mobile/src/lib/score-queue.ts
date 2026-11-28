import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { ApiError, apiPost } from '@/lib/api';

/** One tap, as the server expects it. `seq` orders the events within a match. */
export type QueuedEvent =
  | { id: string; seq: number; kind: 'POINT'; side: 'A' | 'B' }
  | { id: string; seq: number; kind: 'UNDO' };

/** An event the server answered 2xx but refused to apply (for example `matchFinished`). */
export type RejectedEvent = { event: QueuedEvent; reason: string };

export type BlockedInfo = { event: QueuedEvent; status: number | null; code: string };

export type FlushResult = {
  sent: number;
  remaining: number;
  /** Events the server refused during this flush; also kept in the rejected record. */
  rejected?: RejectedEvent[];
  /** The event that stopped the flush. It stays pending. */
  blocked?: BlockedInfo;
  /** The stored queue could not be read; the raw value is kept under the corrupt key. */
  corrupt?: boolean;
};

const keyFor = (matchId: string) => `score-queue:${matchId}`;
const rejectedKeyFor = (matchId: string) => `score-queue-rejected:${matchId}`;
const corruptKeyFor = (matchId: string) => `score-queue-corrupt:${matchId}`;
// Further unreadable values after the first are kept here, so none is dropped silently.
const corruptExtraKeyFor = (matchId: string) => `score-queue-corrupt-extra:${matchId}`;

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

/** A value that cannot be parsed is moved to the corrupt key (never dropped), and reported. */
async function readState(matchId: string): Promise<{ list: QueuedEvent[]; corrupt: boolean }> {
  const raw = await AsyncStorage.getItem(keyFor(matchId));
  if (!raw) return { list: [], corrupt: await isCorrupt(matchId) };
  try {
    const list = JSON.parse(raw) as QueuedEvent[];
    if (!Array.isArray(list)) throw new Error('not a list');
    return { list, corrupt: await isCorrupt(matchId) };
  } catch {
    if ((await AsyncStorage.getItem(corruptKeyFor(matchId))) === null) {
      await AsyncStorage.setItem(corruptKeyFor(matchId), raw);
    } else {
      const extra = await readExtraCorrupt(matchId);
      extra.push(raw);
      await AsyncStorage.setItem(corruptExtraKeyFor(matchId), JSON.stringify(extra));
    }
    await AsyncStorage.removeItem(keyFor(matchId));
    return { list: [], corrupt: true };
  }
}

async function readExtraCorrupt(matchId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(corruptExtraKeyFor(matchId));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

async function isCorrupt(matchId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(corruptKeyFor(matchId))) !== null;
}

async function read(matchId: string): Promise<QueuedEvent[]> {
  return (await readState(matchId)).list;
}

async function write(matchId: string, list: QueuedEvent[]): Promise<void> {
  if (list.length === 0) await AsyncStorage.removeItem(keyFor(matchId));
  else await AsyncStorage.setItem(keyFor(matchId), JSON.stringify(list));
}

/** Events the server refused, with the reason. They no longer block finishing. */
export async function rejectedEvents(matchId: string): Promise<RejectedEvent[]> {
  const raw = await AsyncStorage.getItem(rejectedKeyFor(matchId));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as RejectedEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
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

/** Whether the stored queue was unreadable. The raw value is kept under the corrupt key. */
export function hasCorruptQueue(matchId: string): Promise<boolean> {
  return exclusive(async () => (await readState(matchId)).corrupt);
}

/** How many unreadable stored values were found for this match (0 when the queue is healthy). */
export function corruptCount(matchId: string): Promise<number> {
  return exclusive(async () => {
    const first = (await AsyncStorage.getItem(corruptKeyFor(matchId))) === null ? 0 : 1;
    return first + (await readExtraCorrupt(matchId)).length;
  });
}

/**
 * Removes the unreadable records so the match can be finished. The caller asks the umpire to
 * confirm they have noted the count first. Readable pending taps are not touched. Returns how
 * many unreadable values were removed.
 */
export function clearCorrupt(matchId: string): Promise<number> {
  return exclusive(async () => {
    const first = (await AsyncStorage.getItem(corruptKeyFor(matchId))) === null ? 0 : 1;
    const count = first + (await readExtraCorrupt(matchId)).length;
    await AsyncStorage.removeItem(corruptKeyFor(matchId));
    await AsyncStorage.removeItem(corruptExtraKeyFor(matchId));
    return count;
  });
}

/** Forgets the rejected taps the umpire has seen. */
export function dismissRejected(matchId: string): Promise<void> {
  return exclusive(() => AsyncStorage.removeItem(rejectedKeyFor(matchId)));
}

/** Finishing is allowed only when nothing is waiting to be sent and the queue is readable. */
export async function canFinish(matchId: string): Promise<boolean> {
  return exclusive(async () => {
    const { list, corrupt } = await readState(matchId);
    return list.length === 0 && !corrupt;
  });
}

const running = new Map<string, Promise<FlushResult>>();

/**
 * Sends pending events one at a time in seq order. An event leaves pending only after the server
 * answers 2xx: applied or duplicate events are dropped, refused ones move to the rejected record.
 * A failure stops the flush and is reported in `blocked`; the event stays pending.
 * A second call for the same match while one runs gets the running promise.
 */
export function flush(matchId: string, token: string): Promise<FlushResult> {
  const active = running.get(matchId);
  if (active) return active;
  const run = doFlush(matchId, token).finally(() => running.delete(matchId));
  running.set(matchId, run);
  return run;
}

async function doFlush(matchId: string, token: string): Promise<FlushResult> {
  let sent = 0;
  const rejected: RejectedEvent[] = [];
  const done = (extra: Partial<FlushResult>, remaining: number): FlushResult => ({
    sent,
    remaining,
    ...(rejected.length ? { rejected } : {}),
    ...extra,
  });
  for (;;) {
    const { list, corrupt } = await exclusive(() => readState(matchId));
    const [next] = list;
    if (!next) return done(corrupt ? { corrupt: true } : {}, 0);
    let response: unknown;
    try {
      response = await apiPost(
        `/api/v1/umpire/matches/${matchId}/events`,
        { events: [next] },
        token,
      );
    } catch (error) {
      const blocked: BlockedInfo =
        error instanceof ApiError
          ? { event: next, status: error.status, code: error.code }
          : { event: next, status: null, code: 'NETWORK' };
      return done({ blocked, ...(corrupt ? { corrupt: true } : {}) }, list.length);
    }
    const reason = (response as { rejected?: unknown } | null)?.rejected;
    await exclusive(async () => {
      if (typeof reason === 'string') {
        const record = [...(await rejectedEvents(matchId)), { event: next, reason }];
        await AsyncStorage.setItem(rejectedKeyFor(matchId), JSON.stringify(record));
        rejected.push({ event: next, reason });
      }
      const current = await read(matchId);
      await write(
        matchId,
        current.filter((e) => e.id !== next.id),
      );
    });
    if (typeof reason !== 'string') sent += 1;
  }
}
