import { describe, expect, it, vi } from 'vitest';
import { createTakeoverTicker, TAKEOVER_SWEEP_MS } from './takeover-sweep';
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
