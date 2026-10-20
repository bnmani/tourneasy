import { apiHandler, requireApiActor } from '@/server/lib/api';
import { XLSX_CONTENT_TYPE } from '@/server/lib/xlsx';
import { assertAdmin } from '@/server/services/permissions';
import { playerCsvTemplate, playerXlsxTemplate } from '@/server/services/player-service';

/** GET /api/v1/admin/players/template — example file for the player import (`?format=csv`). */
export const GET = apiHandler(async (request) => {
  assertAdmin(await requireApiActor(request));
  const csv = new URL(request.url).searchParams.get('format') === 'csv';
  return new Response(csv ? playerCsvTemplate() : Buffer.from(playerXlsxTemplate()), {
    headers: {
      'Content-Type': csv ? 'text/csv; charset=utf-8' : XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="tourneasy-spelers-sjabloon.${csv ? 'csv' : 'xlsx'}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
