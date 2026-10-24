import { tournamentLogoFile } from '@/server/services/logo-service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/tournament-logos/:tournamentId — the tournament's logo (D67), public: it is
 * shown on the tournament page and loaded by mail apps. With ?v=… (the version from the page
 * or email) it is cached for a year; a new logo gets a new version.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const logo = await tournamentLogoFile(id);
  if (!logo) return new Response(null, { status: 404 });
  const versioned = new URL(request.url).searchParams.has('v');
  return new Response(new Uint8Array(logo.data), {
    headers: {
      'Content-Type': logo.mimeType,
      'Content-Length': String(logo.data.length),
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'Content-Disposition': 'inline',
    },
  });
}
