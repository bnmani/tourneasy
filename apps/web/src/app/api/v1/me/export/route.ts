import { apiHandler, requireApiActor } from '@/server/lib/api';
import { exportMyData } from '@/server/services/gdpr-service';

/** GET /api/v1/me/export — all my data as a downloadable JSON file (GDPR art. 15/20). */
export const GET = apiHandler(async (request) => {
  const data = await exportMyData(await requireApiActor(request));
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="tourneasy-data-${date}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
