/**
 * Helpers for /api/v1 route handlers: consistent error format (docs/api.md), localized
 * messages from Accept-Language, JSON body parsing and authentication.
 */
import 'server-only';
import { messages, type AppLocale } from '@tourneasy/shared/i18n';
import { createTranslator } from 'next-intl';
import { randomUUID } from 'node:crypto';
import { actorFromRequest } from '../auth/web';
import type { Actor } from '../services/session-service';
import { AppError, isAppError, toApiCode } from './errors';

export function requestLocale(request: Request): AppLocale {
  const header = request.headers.get('accept-language')?.toLowerCase() ?? '';
  return header.startsWith('en') ? 'en' : 'nl';
}

export function errorResponse(error: unknown, request: Request): Response {
  const requestId = randomUUID();
  const appError = isAppError(error) ? error : new AppError('unexpected');
  if (!isAppError(error)) console.error('[api] unexpected error', { requestId, error });

  const locale = requestLocale(request);
  const t = createTranslator({ locale, messages: messages[locale], namespace: 'Errors' });
  const key = appError.code === 'validation' ? 'invalid' : appError.code;
  const message = t(
    key as Parameters<typeof t>[0],
    { minutes: 15, min: 10, ...appError.details } as never,
  );

  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  const retryAfter = appError.details.retryAfterSeconds;
  if (typeof retryAfter === 'number') headers['Retry-After'] = String(retryAfter);

  return Response.json(
    { error: { code: toApiCode(appError.code), message, details: appError.details, requestId } },
    { status: appError.status, headers },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError('validation', { fields: { _form: 'invalid' } });
  }
}

export async function requireApiActor(request: Request): Promise<Actor> {
  const actor = await actorFromRequest(request);
  if (!actor) throw new AppError('unauthorized');
  return actor;
}

/** Wraps a handler so thrown AppErrors become the documented JSON error format. */
export function apiHandler<C>(handler: (request: Request, context: C) => Promise<Response>) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error, request);
    }
  };
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...(init.headers ?? {}) },
  });
}
