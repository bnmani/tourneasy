import { unsubscribe } from '@/server/services/notification-service';

/**
 * POST /api/v1/unsubscribe?u=…&t=…&s=… — one-click unsubscribe (RFC 8058) used by mail apps
 * from the List-Unsubscribe header (D62). The signed link is the authorisation.
 */
export async function POST(request: Request) {
  const q = new URL(request.url).searchParams;
  const ok = await unsubscribe(q.get('u') ?? '', q.get('t') ?? '', q.get('s') ?? '');
  return new Response(null, { status: ok ? 204 : 400 });
}
