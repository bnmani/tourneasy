import AsyncStorage from '@react-native-async-storage/async-storage';

const counterKey = (matchId: string) => `seq-counter:${matchId}`;

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function readCounter(matchId: string): Promise<number> {
  const last = Number.parseInt((await AsyncStorage.getItem(counterKey(matchId))) ?? '0', 10);
  return Number.isFinite(last) && last > 0 ? last : 0;
}

/**
 * The next seq for this match. The counter lives in storage (per match), only increases, and is
 * written before the number is handed out, so a crash after this call never reuses it.
 */
export function nextSeq(matchId: string): Promise<number> {
  return exclusive(async () => {
    const next = (await readCounter(matchId)) + 1;
    await AsyncStorage.setItem(counterKey(matchId), String(next));
    return next;
  });
}

/**
 * Makes sure the counter is at least the highest seq the server has stored for this match, so a
 * new or wiped phone never starts below it. The counter never goes down.
 */
export function seedSeq(matchId: string, serverLastSeq: number): Promise<void> {
  return exclusive(async () => {
    if (!Number.isInteger(serverLastSeq) || serverLastSeq <= 0) return;
    const local = await readCounter(matchId);
    if (serverLastSeq > local)
      await AsyncStorage.setItem(counterKey(matchId), String(serverLastSeq));
  });
}
