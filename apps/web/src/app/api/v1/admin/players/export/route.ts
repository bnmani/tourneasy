import type { Discipline, Gender } from '@tourneasy/db';
import { apiHandler, requireApiActor } from '@/server/lib/api';
import { exportPlayersCsv } from '@/server/services/player-service';

/** GET /api/v1/admin/players/export — players as CSV (same filters as the admin list). */
export const GET = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  const p = new URL(request.url).searchParams;
  const account = p.get('account');
  const csv = await exportPlayersCsv(actor, {
    q: p.get('q') ?? undefined,
    gender: (p.get('gender') as Gender) || undefined,
    discipline: (p.get('discipline') as Discipline) || undefined,
    clubId: p.get('clubId') || undefined,
    account: account === 'with' || account === 'without' ? account : undefined,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tourneasy-spelers-${date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
