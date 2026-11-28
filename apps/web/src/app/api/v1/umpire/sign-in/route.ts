import { z } from 'zod';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { deviceId, parseBody, umpireHandler, umpireJson } from '@/server/lib/umpire-api';
import { signInUmpire } from '@/server/services/umpire-service';

const body = z.union([
  z.object({ pin: z.string().regex(/^\d{6}$/), deviceId }).strict(),
  z.object({ qrToken: z.string().min(16).max(200), deviceId }).strict(),
]);

/**
 * POST /api/v1/umpire/sign-in — { pin | qrToken, deviceId } → { umpireId, sessionToken, expiresAt }.
 * Credentials travel in the body only, never in the URL, and the body is never logged.
 */
export const POST = umpireHandler(async (request) => {
  const input = await parseBody(request, body);
  const credentials = 'pin' in input ? { pin: input.pin } : { qrToken: input.qrToken };
  return umpireJson(
    await signInUmpire(credentials, input.deviceId, requestMetaFromHeaders(request.headers)),
  );
});
