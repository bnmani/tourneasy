/**
 * Take-overs nobody answered in time: marks them TIMED_OUT and opens one desk alert each. Run by
 * `runHousekeeping`, safe to run any number of times or at once: the status change is guarded by
 * PENDING and the alert is unique per request, so a repeat changes nothing.
 * Returns the number of alerts opened.
 */
import { Prisma, prisma } from '@tourneasy/db';

export async function timeoutTakeovers(now = new Date()): Promise<number> {
  const due = await prisma.takeoverRequest.findMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    select: { id: true, courtId: true },
  });
  let opened = 0;
  for (const request of due) {
    const expired = { id: request.id, status: 'PENDING' as const, expiresAt: { lte: now } };
    try {
      opened += await prisma.$transaction(async (tx) => {
        const { count } = await tx.takeoverRequest.updateMany({
          where: expired,
          data: { status: 'TIMED_OUT' },
        });
        if (count === 0) return 0; // answered or timed out by another run meanwhile
        await tx.deskAlert.create({
          data: { courtId: request.courtId, takeoverRequestId: request.id },
        });
        return 1;
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      // The alert already exists: already handled. Just make sure the request is closed.
      await prisma.takeoverRequest.updateMany({ where: expired, data: { status: 'TIMED_OUT' } });
    }
  }
  return opened;
}
