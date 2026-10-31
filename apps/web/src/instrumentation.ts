import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/** First run shortly after start, once the server is up. */
const FIRST_AFTER_MS = 60_000;

/**
 * Runs housekeeping (D62) inside the server (D90): every 15 minutes on the live site and every 60
 * on the test site, so the database can sleep in between (D94, see housekeepingMinutes). Emails
 * go out when they are queued; this run catches up on what is left, releases payment holds and
 * sends reminders. GitHub Actions stays as an hourly backup; every job is safe to run twice
 * (emails are claimed one by one, reminders have dedupe keys). Off in development and during
 * the build; HOUSEKEEPING_IN_PROCESS=0 switches it off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  if (process.env.HOUSEKEEPING_IN_PROCESS === '0') return;

  const { runHousekeeping } = await import('./server/services/jobs-service');
  const { housekeepingMinutes } = await import('./lib/site');
  const minutes = housekeepingMinutes();
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
          `[housekeeping]${first ? ` running every ${minutes} minutes; first run:` : ''}`,
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
    setInterval(() => void tick(), minutes * 60_000).unref();
  }, FIRST_AFTER_MS).unref();
}
