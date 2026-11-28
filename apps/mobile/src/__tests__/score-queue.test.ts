import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, apiPost } from '@/lib/api';
import {
  canFinish,
  clearCorrupt,
  corruptCount,
  enqueue,
  flush,
  hasCorruptQueue,
  pending,
  rejectedEvents,
} from '@/lib/score-queue';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  apiPost: jest.fn(),
}));

const post = apiPost as jest.Mock;
const M = 'match-1';
const point = (seq: number) => ({
  id: `id-${seq}`,
  seq,
  kind: 'POINT' as const,
  side: 'A' as const,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  post.mockReset();
});

describe('score queue', () => {
  it('queued events survive a restart', async () => {
    await enqueue(M, point(1));
    await enqueue(M, point(2));
    // The write is in storage itself, not only in memory.
    const raw = await AsyncStorage.getItem(`score-queue:${M}`);
    expect(JSON.parse(raw as string).map((e: { seq: number }) => e.seq)).toEqual([1, 2]);
    // A fresh read (as after an app restart) sees the same events.
    expect((await pending(M)).map((e) => e.id)).toEqual(['id-1', 'id-2']);
  });

  it('keeps events in seq order and separate per match', async () => {
    await enqueue(M, point(2));
    await enqueue(M, point(1));
    await enqueue('match-2', point(1));
    expect((await pending(M)).map((e) => e.seq)).toEqual([1, 2]);
    expect(await pending('match-2')).toHaveLength(1);
  });

  it('finish is blocked while events are pending', async () => {
    expect(await canFinish(M)).toBe(true);
    await enqueue(M, point(1));
    expect(await canFinish(M)).toBe(false);
    post.mockResolvedValue({ applied: 1 });
    await flush(M, 'tok');
    expect(await canFinish(M)).toBe(true);
  });

  it('flush sends in seq order and removes acknowledged events', async () => {
    await enqueue(M, point(2));
    await enqueue(M, point(1));
    post.mockResolvedValue({ applied: 1 });
    const result = await flush(M, 'tok');
    expect(post.mock.calls.map((c) => c[1].events[0].seq)).toEqual([1, 2]);
    expect(post.mock.calls[0][0]).toBe(`/api/v1/umpire/matches/${M}/events`);
    expect(post.mock.calls[0][2]).toBe('tok');
    expect(result).toEqual({ sent: 2, remaining: 0 });
    expect(await pending(M)).toEqual([]);
  });

  it('flush removes only acknowledged events and stops on the first failure', async () => {
    await enqueue(M, point(1));
    await enqueue(M, point(2));
    await enqueue(M, point(3));
    post
      .mockResolvedValueOnce({ applied: 1 })
      .mockRejectedValueOnce(new ApiError(503, 'UNKNOWN', 'UNKNOWN'))
      .mockResolvedValue({ applied: 1 });
    const result = await flush(M, 'tok');
    expect(post).toHaveBeenCalledTimes(2); // did not skip ahead to seq 3
    expect(result).toMatchObject({ sent: 1, remaining: 2, blocked: { status: 503 } });
    expect((await pending(M)).map((e) => e.seq)).toEqual([2, 3]);
    expect(await canFinish(M)).toBe(false);
  });

  it('concurrent enqueues lose nothing', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((n) => enqueue(M, point(n))));
    expect(await pending(M)).toHaveLength(5);
  });

  it('stores no token', async () => {
    await enqueue(M, point(1));
    post.mockRejectedValue(new Error('offline'));
    await flush(M, 'secret-token');
    const all = JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()));
    expect(all).not.toContain('secret-token');
  });

  it('a rejected event moves to the rejected record and does not block finish', async () => {
    await enqueue(M, point(1));
    post.mockResolvedValue({ applied: 0, rejected: 'matchFinished' });
    const result = await flush(M, 'tok');
    expect(result.rejected).toEqual([{ event: point(1), reason: 'matchFinished' }]);
    expect(result.sent).toBe(0);
    expect(await pending(M)).toEqual([]);
    expect(await rejectedEvents(M)).toEqual([{ event: point(1), reason: 'matchFinished' }]);
    const raw = await AsyncStorage.getItem(`score-queue-rejected:${M}`);
    expect(JSON.parse(raw as string)).toHaveLength(1);
    expect(await canFinish(M)).toBe(true);
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [409, 'COURT_HELD'],
  ])('a %i is reported as blocked and the event stays pending', async (status, code) => {
    await enqueue(M, point(1));
    await enqueue(M, point(2));
    post.mockRejectedValue(new ApiError(status, code, code));
    const result = await flush(M, 'tok');
    expect(result.blocked).toEqual({ event: point(1), status, code });
    expect(result).toMatchObject({ sent: 0, remaining: 2 });
    expect(post).toHaveBeenCalledTimes(1);
    expect((await pending(M)).map((e) => e.seq)).toEqual([1, 2]);
  });

  it('overlapping flushes send each event once', async () => {
    await enqueue(M, point(1));
    await enqueue(M, point(2));
    post.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { applied: 1 };
    });
    const [a, b] = await Promise.all([flush(M, 'tok'), flush(M, 'tok')]);
    expect(post).toHaveBeenCalledTimes(2);
    expect(a).toBe(b);
    expect(await pending(M)).toEqual([]);
  });

  it('a corrupt stored value is kept, reported, and blocks finish', async () => {
    await AsyncStorage.setItem(`score-queue:${M}`, '{not json');
    expect(await pending(M)).toEqual([]);
    expect(await AsyncStorage.getItem(`score-queue-corrupt:${M}`)).toBe('{not json');
    expect(await hasCorruptQueue(M)).toBe(true);
    expect(await canFinish(M)).toBe(false);
    await enqueue(M, point(1)); // a new tap does not overwrite the kept raw value
    expect(await AsyncStorage.getItem(`score-queue-corrupt:${M}`)).toBe('{not json');
    post.mockResolvedValue({ applied: 1 });
    const result = await flush(M, 'tok');
    expect(result.corrupt).toBe(true);
    expect(await canFinish(M)).toBe(false);
  });
});

describe('clearing a corrupt queue', () => {
  it('counts every corrupt value, not only the first', async () => {
    await AsyncStorage.setItem(`score-queue:${M}`, '{bad one');
    expect(await pending(M)).toEqual([]);
    await AsyncStorage.setItem(`score-queue:${M}`, '{bad two');
    expect(await pending(M)).toEqual([]);
    expect(await corruptCount(M)).toBe(2);
  });

  it('clearCorrupt removes the corrupt record and lets finish work again', async () => {
    await AsyncStorage.setItem(`score-queue:${M}`, '{bad');
    await pending(M);
    expect(await canFinish(M)).toBe(false);
    expect(await clearCorrupt(M)).toBe(1);
    expect(await corruptCount(M)).toBe(0);
    expect(await hasCorruptQueue(M)).toBe(false);
    expect(await canFinish(M)).toBe(true);
    expect(await AsyncStorage.getItem(`score-queue-corrupt:${M}`)).toBeNull();
  });

  it('clearCorrupt keeps the pending taps', async () => {
    await enqueue(M, point(1));
    await AsyncStorage.setItem(`score-queue-corrupt:${M}`, '{old');
    await clearCorrupt(M);
    expect((await pending(M)).map((e) => e.id)).toEqual(['id-1']);
  });
});
