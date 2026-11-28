/**
 * Helpers for the /api/v1/umpire routes: umpire session from the Authorization header, input
 * checks that run before any service or database call, and the error-to-status mapping.
 * Nothing here logs request bodies, and the session token is never read from the URL.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verifyUmpireSession } from '../services/umpire-service';
import { AppError, isAppError, toApiCode, validationError, type ErrorCode } from './errors';

const STATUS: Partial<Record<ErrorCode, number>> = {
  validation: 422,
  invalidCredentials: 401,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  rateLimited: 429,
  courtHeld: 409,
  takeoverClosed: 409,
  takeoverPending: 409,
  courtNotHeld: 409,
  alreadyHolder: 409,
  eventIdInUse: 409,
  matchNotDecided: 409,
  resultConflict: 409,
  statusTransition: 409,
  matchNotScheduled: 409,
};

export type UmpireSession = Awaited<ReturnType<typeof verifyUmpireSession>>;

export function umpireJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

/** Known domain errors map to their status; anything else is a 500 with no internal detail. */
export function umpireError(error: unknown): Response {
  const requestId = randomUUID();
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (!isAppError(error)) {
    // Log the error object only, never the request or its body.
    console.error('[umpire-api] unexpected error', { requestId, error });
    return Response.json({ error: { code: 'UNEXPECTED', requestId } }, { status: 500, headers });
  }
  let status = STATUS[error.code];
  if (!status) {
    // A code nobody mapped here: say so in the log (code only), then use the status it carries.
    console.error('[umpire-api] unmapped error code', { requestId, code: error.code });
    status = error.status || 500;
  }
  if (status < 400 || status >= 500) {
    return Response.json({ error: { code: 'UNEXPECTED', requestId } }, { status: 500, headers });
  }
  const retryAfter = error.details.retryAfterSeconds;
  if (typeof retryAfter === 'number') headers['Retry-After'] = String(retryAfter);
  // Only field names and error keys are shared, never submitted values.
  const fields = error.details.fields;
  const details = fields && typeof fields === 'object' ? { fields } : {};
  return Response.json(
    { error: { code: toApiCode(error.code), details, requestId } },
    { status, headers },
  );
}

export function umpireHandler<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      return umpireError(error);
    }
  };
}

const deviceIdSchema = z.string().min(1).max(200);

/** Reads the umpire session from `Authorization: Bearer` and the phone id from `X-Device-Id`. */
export async function requireUmpire(request: Request): Promise<UmpireSession> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (\S+)$/.exec(header);
  const deviceId = deviceIdSchema.safeParse(request.headers.get('x-device-id') ?? '');
  if (!match || !deviceId.success) throw new AppError('unauthorized');
  return verifyUmpireSession(match[1]!, deviceId.data);
}

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw validationError({ _form: 'invalid' });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_form'] = 'invalid';
    throw validationError(fields);
  }
  return parsed.data;
}

/** A path parameter that must be a UUID; anything else is a 400 and never reaches the database. */
export function uuidParam(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw validationError({ id: 'invalid' });
  return parsed.data;
}

export const sideSchema = z.enum(['A', 'B']);
export const deviceId = deviceIdSchema;
