import { ApiError, apiGet, apiPost } from '@/lib/api';

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('api client', () => {
  it('apiPost sends JSON with a bearer token', async () => {
    const fetchMock = mockFetch(200, { ok: true });
    const result = await apiPost<{ ok: boolean }>('/api/x', { a: 1 }, 'tok');
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/x$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('apiPost throws ApiError with status 409 and the server code', async () => {
    mockFetch(409, { code: 'COURT_HELD' });
    const err = (await apiPost('/api/x', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('COURT_HELD');
  });

  it('apiGet sends no body and no auth header without a token', async () => {
    const fetchMock = mockFetch(200, { n: 1 });
    await apiGet('/api/y');
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers.Authorization).toBeUndefined();
  });
});
