import { apiHandler, requestLocale, requireApiActor } from '@/server/lib/api';
import { invoicePdf } from '@/server/services/invoice-pdf';

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/me/invoices/{id}?locale=nl|en — invoice for a paid package, buyer or owner (D87). */
export const GET = apiHandler(async (request, { params }: Context) => {
  const actor = await requireApiActor(request);
  const { id } = await params;
  const lang = new URL(request.url).searchParams.get('locale');
  const locale = lang === 'en' || lang === 'nl' ? lang : requestLocale(request);
  const { bytes, filename } = await invoicePdf(actor, id, locale);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
