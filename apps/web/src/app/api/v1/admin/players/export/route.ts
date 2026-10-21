import type { Discipline, Gender } from '@tourneasy/db';
import { apiHandler, requireApiActor } from '@/server/lib/api';
import { XLSX_CONTENT_TYPE } from '@/server/lib/xlsx';
import {
  exportPlayersCsv,
  exportPlayersXlsx,
  PLAYER_SORTS,
  type PlayerFilters,
} from '@/server/services/player-service';

/** GET /api/v1/admin/players/export — players as Excel, or CSV with `?format=csv` (same filters as the admin list). */
export const GET = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  const p = new URL(request.url).searchParams;
  const account = p.get('account');
  const filters: PlayerFilters = {
    q: p.get('q') ?? undefined,
    gender: (p.get('gender') as Gender) || undefined,
    discipline: (p.get('discipline') as Discipline) || undefined,
    clubId: p.get('clubId') || undefined,
    account: account === 'with' || account === 'without' ? account : undefined,
    sort: PLAYER_SORTS.find((s) => s === p.get('sort')),
    dir: p.get('dir') === 'desc' ? 'desc' : 'asc',
  };
  const date = new Date().toISOString().slice(0, 10);
  if (p.get('format') === 'csv') {
    return new Response(await exportPlayersCsv(actor, filters), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tourneasy-spelers-${date}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return new Response(Buffer.from(await exportPlayersXlsx(actor, filters)), {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="tourneasy-spelers-${date}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
