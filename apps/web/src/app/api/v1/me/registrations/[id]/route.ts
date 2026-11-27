import { apiHandler, requireApiActor } from '@/server/lib/api';
import { readOptionalJson } from '@/server/lib/request-body';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { withdrawMyRegistration } from '@/server/services/registration-service';

type Context = { params: Promise<{ id: string }> };

/** DELETE /api/v1/me/registrations/{id} — withdraw (optional { reason }) → 204. */
export const DELETE = apiHandler(async (request, { params }: Context) => {
  const body = await readOptionalJson(request);
  await withdrawMyRegistration(
    await requireApiActor(request),
    (await params).id,
    body,
    requestMetaFromHeaders(request.headers),
  );
  return new Response(null, { status: 204 });
});
