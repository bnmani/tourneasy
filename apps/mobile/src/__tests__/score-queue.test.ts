import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, apiPost } from '@/lib/api';
import { canFinish, enqueue, flush, pending } from '@/lib/score-queue';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  apiPost: jest.fn(),
}));

const post = apiPost as jest.Mock;
const M = 'match-1';
const point = (seq: number) => ({ id: `id-${seq}`, seq, kind: 'POINT' as const, side: 'A' as const });

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
      .mockRejectedValueOnce(new ApiError(503, 'UNKNOWN'))
      .mockResolvedValue({ applied: 1 });
    const result = await flush(M, 'tok');
    expect(post).toHaveBeenCalledTimes(2); // did not skip ahead to seq 3
    expect(result).toEqual({ sent: 1, remaining: 2 });
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
});
