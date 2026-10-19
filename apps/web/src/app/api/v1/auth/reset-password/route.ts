import { apiHandler, readJson } from '@/server/lib/api';
import { requestMetaFromHeaders } from '@/server/lib/request-meta';
import { resetPassword } from '@/server/services/auth-service';

/** POST /api/v1/auth/reset-password — { token, password }; logs out all devices. */
export const POST = apiHandler(async (request) => {
  await resetPassword(await readJson(request), requestMetaFromHeaders(request.headers));
  return new Response(null, { status: 204 });
});
