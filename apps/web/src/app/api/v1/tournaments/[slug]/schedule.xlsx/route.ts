import { apiHandler } from '@/server/lib/api';
import { getActor } from '@/server/auth/web';
import { XLSX_CONTENT_TYPE } from '@/server/lib/xlsx';
import { scheduleXlsx } from '@/server/services/schedule-pdf-service';

type Context = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/tournaments/{slug}/schedule.xlsx?lang=nl|en — the schedule in Excel (D79): an
 * "All" sheet and one per day. Same access as the PDF.
 */
export const GET = apiHandler(async (request, { params }: Context) => {
  const { slug } = await params;
  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'nl';
  const { bytes, filename } = await scheduleXlsx(await getActor(), slug, lang);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
