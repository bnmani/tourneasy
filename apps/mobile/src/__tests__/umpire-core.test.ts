import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceId } from '@/lib/device';
import { displayScore } from '@/lib/local-score';
import { extractQrToken } from '@/lib/qr';
import { nextSeq, recordTap, type Tap } from '@/lib/seq';
import { enqueue, pending } from '@/lib/score-queue';
import { blockedAction } from '@/lib/umpire-sync';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/lib/score-queue', () => {
  const actual = jest.requireActual('@/lib/score-queue');
  return { ...actual, enqueue: jest.fn(actual.enqueue) };
});

const M = 'match-1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('seq counter', () => {
  it('only increases and never repeats, even for simultaneous taps', async () => {
    const seqs = await Promise.all(Array.from({ length: 20 }, () => nextSeq(M)));
    expect(new Set(seqs).size).toBe(20);
    expect(Math.min(...seqs)).toBe(1);
    expect(Math.max(...seqs)).toBe(20);
  });

  it('continues from the stored value after a restart', async () => {
    expect(await nextSeq(M)).toBe(1);
    expect(await nextSeq(M)).toBe(2);
    // A new process has no memory; only storage remains. Storage holds the last used seq.
    expect(await AsyncStorage.getItem(`seq-counter:${M}`)).toBe('2');
    await AsyncStorage.setItem(`seq-counter:${M}`, '41');
    expect(await nextSeq(M)).toBe(42);
  });

  it('is kept per match', async () => {
    await nextSeq(M);
    await nextSeq(M);
    expect(await nextSeq('match-2')).toBe(1);
  });

  it('is advanced before the tap is saved, so a failed save never frees the seq', async () => {
    (enqueue as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(recordTap(M, { kind: 'POINT', side: 'A' })).rejects.toThrow('disk full');
    expect(await AsyncStorage.getItem(`seq-counter:${M}`)).toBe('1');
    expect(await nextSeq(M)).toBe(2);
  });

  it('numbers each saved tap with the counter', async () => {
    await recordTap(M, { kind: 'POINT', side: 'A' });
    await recordTap(M, { kind: 'UNDO' });
    await recordTap(M, { kind: 'POINT', side: 'B' });
    const saved = await pending(M);
    expect(saved.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(new Set(saved.map((e) => e.id)).size).toBe(3);
  });
});

describe('device id', () => {
  it('is generated once and then stored', async () => {
    const first = await getDeviceId();
    expect(first.length).toBeGreaterThan(8);
    expect(await getDeviceId()).toBe(first);
    expect(await AsyncStorage.getItem('device-id')).toBe(first);
  });
});

describe('blocked sends', () => {
  const event = { id: 'e', seq: 1, kind: 'UNDO' as const };
  it('401 means sign in again', () => {
    expect(blockedAction({ event, status: 401, code: 'UNAUTHORIZED' })).toBe('signIn');
  });
  it('a permanent 409 or other 4xx means contact the desk', () => {
    expect(blockedAction({ event, status: 409, code: 'X' })).toBe('contactDesk');
    expect(blockedAction({ event, status: 422, code: 'X' })).toBe('contactDesk');
  });
  it('offline or 5xx means retry when the connection returns', () => {
    expect(blockedAction({ event, status: null, code: 'NETWORK' })).toBe('retry');
    expect(blockedAction({ event, status: 503, code: 'X' })).toBe('retry');
  });
});

describe('QR token', () => {
  it('is read from the fragment or the query', () => {
    expect(extractQrToken('https://tourneasy.com/umpire#token=abc123def456')).toBe('abc123def456');
    expect(extractQrToken('https://tourneasy.com/umpire?token=abc%2B123')).toBe('abc+123');
  });
  it('is null when the link has none', () => {
    expect(extractQrToken('https://tourneasy.com/umpire')).toBeNull();
  });
});

describe('local score display', () => {
  it('counts points, serving and undo', () => {
    const taps: Tap[] = [
      { kind: 'POINT', side: 'A' },
      { kind: 'POINT', side: 'B' },
      { kind: 'POINT', side: 'B' },
      { kind: 'UNDO' },
    ];
    expect(displayScore(taps)).toEqual({ games: [[1, 1]], serving: 'B' });
  });
  it('starts a new game after 21 with a 2 point lead', () => {
    const taps: Tap[] = [
      ...Array.from({ length: 21 }, () => ({ kind: 'POINT', side: 'A' }) as Tap),
      { kind: 'POINT', side: 'B' },
    ];
    expect(displayScore(taps).games).toEqual([
      [21, 0],
      [0, 1],
    ]);
  });
});
