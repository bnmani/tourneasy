import { apiHandler, requestLocale, requireApiActor } from '@/server/lib/api';
import { foodOrdersXlsx } from '@/server/services/food-service';

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/admin/tournaments/{id}/food.xlsx?lang=nl|en — kitchen totals and orders (D87). */
export const GET = apiHandler(async (request, { params }: Context) => {
  const actor = await requireApiActor(request);
  const { id } = await params;
  const lang = new URL(request.url).searchParams.get('lang');
  const locale = lang === 'en' || lang === 'nl' ? lang : requestLocale(request);
  const bytes = await foodOrdersXlsx(actor, id, locale);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="food-orders.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
