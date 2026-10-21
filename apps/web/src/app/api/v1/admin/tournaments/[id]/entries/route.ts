import type { RegistrationStatus } from '@tourneasy/db';
import { apiHandler, json, requireApiActor } from '@/server/lib/api';
import { listTournamentEntries } from '@/server/services/registration-service';

type Context = { params: Promise<{ id: string }> };
const STATUSES = ['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'REFUNDED'];

/** GET /api/v1/admin/tournaments/{id}/entries — participants (organisers of the tournament). */
export const GET = apiHandler(async (request, { params }: Context) => {
  const p = new URL(request.url).searchParams;
  const status = p.get('status');
  const data = await listTournamentEntries(await requireApiActor(request), (await params).id, {
    eventId: p.get('eventId') || undefined,
    status: status && STATUSES.includes(status) ? (status as RegistrationStatus) : undefined,
  });
  return json({ data });
});
