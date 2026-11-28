import { describe, expect, it, vi } from 'vitest';
import { createTakeoverSweeper, createTakeoverTicker, TAKEOVER_SWEEP_MS } from './takeover-sweep';
import { timeoutTakeovers } from './takeover-timeout';

describe('take-over sweep', () => {
  it('runs every 10 seconds so the desk alert follows the 120 second window closely', () => {
    expect(TAKEOVER_SWEEP_MS).toBe(10_000);
  });

  it('the default ticker calls timeoutTakeovers', async () => {
    const sweep = vi.fn().mockResolvedValue(0);
    await createTakeoverTicker(sweep)();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(createTakeoverTicker.defaultSweep).toBe(timeoutTakeovers);
  });

  it('does not start a second sweep while one is running, and recovers after an error', async () => {
    let release!: () => void;
    const sweep = vi
      .fn()
      .mockImplementationOnce(() => new Promise<number>((r) => (release = () => r(0))))
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(0);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tick = createTakeoverTicker(sweep);
    const first = tick();
    await tick();
    expect(sweep).toHaveBeenCalledTimes(1);
    release();
    await first;
    await tick(); // rejects inside, is logged
    await tick();
    expect(sweep).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });
});

describe('take-over sweep is armed only while requests are pending', () => {
  function fakeTimers() {
    const timers = new Map<number, () => void>();
    let next = 1;
    return {
      timers,
      setInterval: vi.fn<(fn: () => void, ms: number) => number>((fn) => {
        const id = next++;
        timers.set(id, fn);
        return id;
      }),
      clearInterval: vi.fn((id: unknown) => void timers.delete(id as number)),
    };
  }

  it('schedules no sweep work at start when no request is pending', async () => {
    const t = fakeTimers();
    const sweep = vi.fn().mockResolvedValue(0);
    const sweeper = createTakeoverSweeper({ sweep, pending: async () => 0, ...t });
    sweeper.enable();
    await sweeper.armIfPending();
    expect(t.setInterval).not.toHaveBeenCalled();
    expect(sweeper.isArmed()).toBe(false);
    expect(sweep).not.toHaveBeenCalled();
  });

  it('arms at start when a request is pending (after a restart)', async () => {
    const t = fakeTimers();
    const sweeper = createTakeoverSweeper({
      sweep: vi.fn().mockResolvedValue(0),
      pending: async () => 1,
      ...t,
    });
    sweeper.enable();
    await sweeper.armIfPending();
    expect(t.setInterval).toHaveBeenCalledTimes(1);
    expect(t.setInterval.mock.calls[0]![1]).toBe(TAKEOVER_SWEEP_MS);
    sweeper.stop();
  });

  it('a new request arms it once; it stops when none are left', async () => {
    const t = fakeTimers();
    let pending = 1;
    const sweep = vi.fn().mockResolvedValue(0);
    const sweeper = createTakeoverSweeper({ sweep, pending: async () => pending, ...t });
    sweeper.enable();
    sweeper.arm();
    sweeper.arm();
    expect(t.setInterval).toHaveBeenCalledTimes(1);
    await sweeper.tick();
    expect(sweeper.isArmed()).toBe(true); // still one pending
    pending = 0;
    await sweeper.tick();
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(sweeper.isArmed()).toBe(false);
    expect(t.clearInterval).toHaveBeenCalledTimes(1);
    expect(t.timers.size).toBe(0);
  });

  it('a request made while a tick counts is not lost', async () => {
    const t = fakeTimers();
    const sweeper: ReturnType<typeof createTakeoverSweeper> = createTakeoverSweeper({
      sweep: vi.fn().mockResolvedValue(0),
      // The count saw nothing, but a request was created (and armed) meanwhile.
      pending: async () => {
        sweeper.arm();
        return 0;
      },
      ...t,
    });
    sweeper.enable();
    sweeper.arm();
    await sweeper.tick();
    expect(sweeper.isArmed()).toBe(true);
    sweeper.stop();
  });

  it('does nothing until enabled (development, tests, build)', () => {
    const t = fakeTimers();
    const sweeper = createTakeoverSweeper({
      sweep: vi.fn().mockResolvedValue(0),
      pending: async () => 1,
      ...t,
    });
    sweeper.arm();
    expect(t.setInterval).not.toHaveBeenCalled();
  });
});
