import { apiHandler, publicJson } from '@/server/lib/api';
import { listPublicLevels } from '@/server/services/public-service';

/** GET /api/v1/levels — active skill levels (id, code, name), lowest rank first. */
export const GET = apiHandler(async (request) => {
  return publicJson(request, { data: await listPublicLevels() }, 300);
});
