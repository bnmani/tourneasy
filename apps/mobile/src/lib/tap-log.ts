import AsyncStorage from '@react-native-async-storage/async-storage';

export type Tap = { kind: 'POINT'; side: 'A' | 'B' } | { kind: 'UNDO' };

const logKey = (matchId: string) => `score-log:${matchId}`;

let chain: Promise<unknown> = Promise.resolve();

/** Taps made on this phone, kept for reference only. The queue is the record that is sent. */
export async function readTapLog(matchId: string): Promise<Tap[]> {
  const raw = await AsyncStorage.getItem(logKey(matchId));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? (list as Tap[]) : [];
  } catch {
    return [];
  }
}

export function appendTap(matchId: string, tap: Tap): Promise<void> {
  const run = chain.then(async () => {
    const log = await readTapLog(matchId);
    log.push(tap);
    await AsyncStorage.setItem(logKey(matchId), JSON.stringify(log));
  });
  chain = run.catch(() => undefined);
  return run;
}
