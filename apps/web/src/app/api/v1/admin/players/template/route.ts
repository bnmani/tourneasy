import { apiHandler, requireApiActor } from '@/server/lib/api';
import { assertAdmin } from '@/server/services/permissions';
import { playerCsvTemplate } from '@/server/services/player-service';

/** GET /api/v1/admin/players/template — example CSV for the player import. */
export const GET = apiHandler(async (request) => {
  assertAdmin(await requireApiActor(request));
  return new Response(playerCsvTemplate(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tourneasy-spelers-sjabloon.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
});
