import { apiHandler, json, readJson, requireApiActor } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { respondToInvite } from '@/server/services/registration-service';

type Context = { params: Promise<{ id: string }> };

/** POST /api/v1/me/invites/{id} — { accept: boolean } → { tournamentSlug }. */
export const POST = apiHandler(async (request, { params }: Context) => {
  const body = (await readJson(request)) as { accept?: unknown };
  return json(
    await respondToInvite(
      await requireApiActor(request),
      { id: (await params).id },
      body?.accept === true,
      requestMetaFromHeaders(request.headers),
    ),
  );
});
