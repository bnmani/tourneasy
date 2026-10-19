import { apiHandler, readJson } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { requestPasswordReset } from '@/server/services/auth-service';

/** POST /api/v1/auth/forgot-password — always 202, so it can't reveal which emails exist. */
export const POST = apiHandler(async (request) => {
  await requestPasswordReset(await readJson(request), requestMetaFromHeaders(request.headers));
  return new Response(null, { status: 202 });
});
