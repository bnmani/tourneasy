import { apiHandler, readJson, requireApiActor } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { withdrawMyRegistration } from '@/server/services/registration-service';

type Context = { params: Promise<{ id: string }> };

/** DELETE /api/v1/me/registrations/{id} — withdraw (optional { reason }) → 204. */
export const DELETE = apiHandler(async (request, { params }: Context) => {
  const body = request.headers.get('content-length') ? await readJson(request) : {};
  await withdrawMyRegistration(
    await requireApiActor(request),
    (await params).id,
    body,
    requestMetaFromHeaders(request.headers),
  );
  return new Response(null, { status: 204 });
});
