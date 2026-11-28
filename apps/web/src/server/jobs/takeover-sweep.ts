/**
 * The desk alert for an unanswered take-over must follow the 120 second window closely, so the
 * in-process server sweeps for expired requests every 10 seconds (housekeeping, every 15 minutes
 * live, stays as the backstop). The sweep runs ONLY while at least one PENDING request exists:
 * `requestTakeover` arms it, and it stops itself once none are left, so the database can sleep
 * the rest of the time (D94). Only one cheap query runs per tick; it is idempotent.
 */
import { prisma } from '@tourneasy/db';
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

type Timer = unknown;
export type SweeperDeps = {
  sweep: () => Promise<number>;
  /** How many requests are still PENDING. */
  pending: () => Promise<number>;
  setInterval: (fn: () => void, ms: number) => Timer;
  clearInterval: (timer: Timer) => void;
};

/**
 * Starts and stops the 10 second interval. Off until `enable()` (the server's instrumentation
 * calls it under the production gates), so development, tests and the build never schedule it.
 */
export function createTakeoverSweeper(deps: SweeperDeps) {
  let enabled = false;
  let timer: Timer | null = null;
  // Bumped on every arm, so a tick whose count raced a new request does not stop the sweep.
  let generation = 0;

  const stop = () => {
    if (timer !== null) deps.clearInterval(timer);
    timer = null;
  };

  const tick = createTakeoverTicker(async () => {
    const seen = generation;
    const opened = await deps.sweep();
    if ((await deps.pending()) === 0 && seen === generation) stop();
    return opened;
  });

  const arm = () => {
    if (!enabled) return;
    generation += 1;
    if (timer === null) timer = deps.setInterval(() => void tick(), TAKEOVER_SWEEP_MS);
  };

  return {
    enable: () => void (enabled = true),
    disable: () => void (enabled = false),
    arm,
    /** At start: picks up requests left PENDING by a restart; does nothing when there are none. */
    armIfPending: async () => {
      if (enabled && (await deps.pending()) > 0) arm();
    },
    tick,
    stop,
    isArmed: () => timer !== null,
  };
}

/** The server's one sweeper. */
export const takeoverSweeper = createTakeoverSweeper({
  sweep: () => timeoutTakeovers(),
  pending: () => prisma.takeoverRequest.count({ where: { status: 'PENDING' } }),
  // unref: never keeps the process alive on its own.
  setInterval: (fn, ms) => setInterval(fn, ms).unref(),
  clearInterval: (timer) => clearInterval(timer as NodeJS.Timeout),
});

/** Called after a take-over request is stored. */
export function armTakeoverSweep(): void {
  takeoverSweeper.arm();
}
