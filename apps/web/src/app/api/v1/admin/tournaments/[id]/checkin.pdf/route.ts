import { apiHandler, requestLocale, requireApiActor } from '@/server/lib/api';
import { checkInPdf } from '@/server/services/checkin-service';

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/admin/tournaments/{id}/checkin.pdf?day=YYYY-MM-DD&lang=nl|en — printable check-in list (D77). */
export const GET = apiHandler(async (request, { params }: Context) => {
  const actor = await requireApiActor(request);
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const lang = query.get('lang');
  const locale = lang === 'en' || lang === 'nl' ? lang : requestLocale(request);
  const { bytes, filename } = await checkInPdf(actor, id, query.get('day') ?? undefined, locale);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
