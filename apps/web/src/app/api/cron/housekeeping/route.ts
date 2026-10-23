import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@tourneasy/db';
import { runHousekeeping } from '@/server/services/jobs-service';

/** SiteSetting key with the SHA-256 of the scheduler's key (set once, D62). */
const CRON_KEY_SETTING = 'cron.keyHash';

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The caller's key matches CRON_SECRET, or the key whose hash is stored in the database. */
async function authorised(request: Request) {
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (given.length < 32) return false;
  const secret = process.env.CRON_SECRET;
  if (secret && same(given, secret)) return true;
  const row = await prisma.siteSetting.findUnique({ where: { key: CRON_KEY_SETTING } });
  const hash = typeof row?.value === 'string' ? row.value : null;
  return !!hash && same(createHash('sha256').update(given).digest('hex'), hash);
}

/**
 * POST /api/cron/housekeeping — called every 15 minutes by a GitHub Actions schedule with
 * `Authorization: Bearer <key>` (D62): releases expired payment holds, queues reminders,
 * deadline and results emails, and sends queued emails. Safe to call any number of times.
 */
export async function POST(request: Request) {
  if (!(await authorised(request)))
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  const result = await runHousekeeping();
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
