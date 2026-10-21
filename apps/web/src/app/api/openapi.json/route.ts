import { buildOpenApi } from '@/server/lib/openapi';

/** GET /api/openapi.json — OpenAPI 3 description of the public API. */
export function GET(request: Request) {
  const origin = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, '');
  return Response.json(buildOpenApi(origin), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
