import { apiHandler, readJson, requireApiActor } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { invitePartner } from '@/server/services/registration-service';

type Context = { params: Promise<{ id: string }> };

/** PUT /api/v1/me/registrations/{id}/partner — { partner: memberNumber | email } → 204. */
export const PUT = apiHandler(async (request, { params }: Context) => {
  const body = (await readJson(request)) as { partner?: unknown };
  await invitePartner(
    await requireApiActor(request),
    (await params).id,
    body?.partner,
    requestMetaFromHeaders(request.headers),
  );
  return new Response(null, { status: 204 });
});
