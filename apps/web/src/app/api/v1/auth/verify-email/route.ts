import { apiHandler, readJson } from '@/server/lib/api';
import { verifyEmail } from '@/server/services/auth-service';

/** POST /api/v1/auth/verify-email — { token } from the confirmation email. */
export const POST = apiHandler(async (request) => {
  await verifyEmail(await readJson(request));
  return new Response(null, { status: 204 });
});
