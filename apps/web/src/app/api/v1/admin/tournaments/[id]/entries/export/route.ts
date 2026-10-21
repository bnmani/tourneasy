import type { RegistrationStatus } from '@tourneasy/db';
import { apiHandler, requestLocale, requireApiActor } from '@/server/lib/api';
import { toXlsx, XLSX_CONTENT_TYPE } from '@/server/lib/xlsx';
import { exportTournamentEntries } from '@/server/services/registration-service';

type Context = { params: Promise<{ id: string }> };
const STATUSES = ['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'REFUNDED'];

/** GET /api/v1/admin/tournaments/{id}/entries/export — participants as Excel (organisers). */
export const GET = apiHandler(async (request, { params }: Context) => {
  const actor = await requireApiActor(request);
  const { id } = await params;
  const p = new URL(request.url).searchParams;
  const status = p.get('status');
  const { header, rows } = await exportTournamentEntries(
    actor,
    id,
    {
      eventId: p.get('eventId') || undefined,
      status: status && STATUSES.includes(status) ? (status as RegistrationStatus) : undefined,
    },
    requestLocale(request),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(Buffer.from(toXlsx('Deelnemers', header, rows)), {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="deelnemers-${date}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
