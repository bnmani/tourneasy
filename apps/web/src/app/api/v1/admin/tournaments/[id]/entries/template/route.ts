import { apiHandler, requireApiActor } from '@/server/lib/api';
import { XLSX_CONTENT_TYPE } from '@/server/lib/xlsx';
import { entryImportTemplate } from '@/server/services/entry-import-service';

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/admin/tournaments/{id}/entries/template — example file for the participants import. */
export const GET = apiHandler(async (request, { params }: Context) => {
  const bytes = await entryImportTemplate(await requireApiActor(request), (await params).id);
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': 'attachment; filename="tourneasy-deelnemers-sjabloon.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
});
