import { apiHandler } from '@/server/lib/api';
import { getActor } from '@/server/auth/web';
import { courtsPdf } from '@/server/services/schedule-pdf-service';

type Context = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/tournaments/{slug}/courts.pdf?lang=nl|en — one page per court (D79), for the
 * tournament's organisers and admins.
 */
export const GET = apiHandler(async (request, { params }: Context) => {
  const { slug } = await params;
  const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'nl';
  const { bytes, filename } = await courtsPdf(await getActor(), slug, lang);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
