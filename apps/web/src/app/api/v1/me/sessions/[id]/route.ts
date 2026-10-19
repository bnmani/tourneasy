import { apiHandler, requireApiActor } from '@/server/lib/api';
import { revokeSession } from '@/server/services/session-service';

/** DELETE /api/v1/me/sessions/:id — log out one of my devices. */
export const DELETE = apiHandler<{ params: Promise<{ id: string }> }>(
  async (request, { params }) => {
    const actor = await requireApiActor(request);
    await revokeSession(actor, (await params).id);
    return new Response(null, { status: 204 });
  },
);
