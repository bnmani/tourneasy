import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/** How often the server runs housekeeping itself (payment holds, reminders, the email queue). */
const EVERY_MS = 5 * 60_000;
/** First run shortly after start, once the server is up. */
const FIRST_AFTER_MS = 60_000;

/**
 * Runs housekeeping (D62) inside the server, every 5 minutes (D90). GitHub's 15-minute schedule
 * is best effort: on busy days it runs a few times a day, which left payment holds and queued
 * emails waiting for hours. It stays as a backup; every job is safe to run twice (emails are
 * claimed one by one, reminders have dedupe keys). Off in development and during the build;
 * HOUSEKEEPING_IN_PROCESS=0 switches it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  if (process.env.HOUSEKEEPING_IN_PROCESS === '0') return;

  const { runHousekeeping } = await import('./server/services/jobs-service');
  let running = false;
  let first = true;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runHousekeeping();
      // The first run is always logged (the runtime logs show it is on); later ones only
      // when they did something.
      if (first || Object.values(result).some((n) => typeof n === 'number' && n > 0))
        console.log(
          `[housekeeping]${first ? ' running every 5 minutes; first run:' : ''}`,
          JSON.stringify(result),
        );
      first = false;
    } catch (error) {
      console.error('[housekeeping] failed', error);
    } finally {
      running = false;
    }
  };
  // unref: never keeps the process alive on its own.
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), EVERY_MS).unref();
  }, FIRST_AFTER_MS).unref();
}
