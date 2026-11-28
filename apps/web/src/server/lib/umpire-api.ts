/**
 * Helpers for the /api/v1/umpire routes: umpire session from the Authorization header, input
 * checks that run before any service or database call, and the error-to-status mapping.
 * Nothing here logs request bodies, and the session token is never read from the URL.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { verifyUmpireSession } from '../services/umpire-service';
import { AppError, isAppError, toApiCode, type ErrorCode } from './errors';

const STATUS: Partial<Record<ErrorCode, number>> = {
  validation: 400,
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
  const status = isAppError(error) ? STATUS[error.code] : undefined;
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (!isAppError(error) || !status) {
    // Log the error object only (never the request), tagged so it can be found.
    if (!isAppError(error)) console.error('[umpire-api] unexpected error', { requestId, error });
    return Response.json({ error: { code: 'UNEXPECTED', requestId } }, { status: 500, headers });
  }
  const retryAfter = error.details.retryAfterSeconds;
  if (typeof retryAfter === 'number') headers['Retry-After'] = String(retryAfter);
  return Response.json({ error: { code: toApiCode(error.code), requestId } }, { status, headers });
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
    throw new AppError('validation');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError('validation');
  return parsed.data;
}

/** A path parameter that must be a UUID; anything else is a 400 and never reaches the database. */
export function uuidParam(value: unknown): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new AppError('validation');
  return parsed.data;
}

export const sideSchema = z.enum(['A', 'B']);
export const deviceId = deviceIdSchema;
