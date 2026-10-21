import type { OrderStatus } from '@tourneasy/db';
import { apiHandler, requireApiActor } from '@/server/lib/api';
import { toXlsx, XLSX_CONTENT_TYPE } from '@/server/lib/xlsx';
import { exportPayments } from '@/server/services/payment-service';

const STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/** GET /api/v1/admin/payments/export — paid and refunded orders as Excel (admins). */
export const GET = apiHandler(async (request) => {
  const actor = await requireApiActor(request);
  const p = new URL(request.url).searchParams;
  const status = p.get('status');
  const { header, rows } = await exportPayments(actor, {
    tournamentId: p.get('tournamentId') || undefined,
    status: status && STATUSES.includes(status) ? (status as OrderStatus) : undefined,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(Buffer.from(toXlsx('Betalingen', header, rows)), {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="betalingen-${date}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
