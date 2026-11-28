/**
 * The desk alert for an unanswered take-over must follow the 120 second window closely, so the
 * in-process server sweeps for expired requests every 10 seconds (housekeeping, every 15 minutes
 * live, stays as the backstop). Only this one cheap query runs here; it is idempotent.
 */
import { timeoutTakeovers } from './takeover-timeout';

export const TAKEOVER_SWEEP_MS = 10_000;

/** A tick that never overlaps itself and never throws. */
export function createTakeoverTicker(sweep: () => Promise<number> = timeoutTakeovers) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const opened = await sweep();
      if (opened > 0) console.log(`[takeover-sweep] opened ${opened} desk alert(s)`);
    } catch (error) {
      console.error('[takeover-sweep] failed', error);
    } finally {
      running = false;
    }
  };
}
createTakeoverTicker.defaultSweep = timeoutTakeovers;
