import { describe, expect, it } from 'vitest';

import { isAppError } from './errors';
import { readOptionalJson } from './request-body';

const del = (body?: string, headers: Record<string, string> = {}) =>
  new Request('https://test.example/api/v1/me/registrations/x', {
    method: 'DELETE',
    body,
    headers,
  });

describe('readOptionalJson', () => {
  it('treats a missing body as {}', async () => {
    await expect(readOptionalJson(del())).resolves.toEqual({});
  });

  it('treats an empty body sent with Content-Length: 0 as {} (iOS)', async () => {
    await expect(readOptionalJson(del('', { 'content-length': '0' }))).resolves.toEqual({});
  });

  it('reads a JSON body', async () => {
    await expect(readOptionalJson(del('{"reason":"injured"}'))).resolves.toEqual({
      reason: 'injured',
    });
  });

  it('rejects a body that is not JSON', async () => {
    const error = await readOptionalJson(del('not json')).catch((e: unknown) => e);
    expect(isAppError(error)).toBe(true);
  });
});
