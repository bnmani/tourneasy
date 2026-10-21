import { timingSafeEqual } from 'node:crypto';
import { expireStaleHolds } from '@/server/services/registration-service';

/**
 * POST /api/cron/housekeeping — releases expired payment holds (and expires their orders).
 * Called every few minutes by a scheduler with `Authorization: Bearer $CRON_SECRET`; the entry
 * pages also release holds lazily, so a missed run only delays the waiting list.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const ok =
    !!secret &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const released = await expireStaleHolds();
  return Response.json({ released }, { headers: { 'Cache-Control': 'no-store' } });
}
