import { apiHandler } from '@/server/lib/api';
import { getActor } from '@/server/auth/web';
import { schedulePdf } from '@/server/services/schedule-pdf-service';

type Context = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/tournaments/{slug}/schedule.pdf?lang=nl|en — the schedule as a printable PDF
 * (D73). Public once the schedule is published; before that only for its organisers/admins.
 */
export const GET = apiHandler(async (request, { params }: Context) => {
  const { slug } = await params;
  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'nl';
  const { bytes, filename } = await schedulePdf(await getActor(), slug, lang);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
