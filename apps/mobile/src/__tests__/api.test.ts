import { ApiError, apiGet, apiPost } from '@/lib/api';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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

describe('api client device header', () => {
  it('sends X-Device-Id with the bearer token, the same stored id every time', async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await apiPost('/api/x', {}, 'tok');
    await apiGet('/api/y', 'tok');
    const first = fetchMock.mock.calls[0][1].headers['X-Device-Id'];
    const second = fetchMock.mock.calls[1][1].headers['X-Device-Id'];
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(8);
    expect(second).toBe(first);
  });

  it('sends no device header without a token', async () => {
    const fetchMock = mockFetch(200, { ok: true });
    await apiGet('/api/y');
    expect(fetchMock.mock.calls[0][1].headers['X-Device-Id']).toBeUndefined();
  });

  it('reads the error code from the umpire error body', async () => {
    mockFetch(409, { error: { code: 'COURT_HELD', details: {}, requestId: 'r' } });
    const err = (await apiPost('/api/x', {}, 'tok').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('COURT_HELD');
  });
});
