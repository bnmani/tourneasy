import { AppError } from './errors';

/**
 * Reads a JSON body that may be left out. An empty body counts as `{}`: iOS sends
 * `Content-Length: 0` on a DELETE without a body, so the header alone can't tell
 * "no body" from "a body". Text that is there but isn't JSON is still a validation error.
 */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('validation', { fields: { _form: 'invalid' } });
  }
}
