import { prisma } from '@tourneasy/db';

export const dynamic = 'force-dynamic';

/** Liveness + database check for Docker/hosting health probes. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'up' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Logged server-side only (visible in the host's runtime logs), never sent to the client.
    console.error('[health] database check failed:', error);
    return Response.json(
      { status: 'error', db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
