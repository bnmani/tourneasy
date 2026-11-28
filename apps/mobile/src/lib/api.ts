/** Base address of the Tourneasy API. The test server is the default until production is live. */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://test.tourneasy.app/api/v1';

/** An error answer from the API. `code` is stable; `message` is already in the device's language. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** For validation errors: the fields the server rejected, as { field: reason }. */
  readonly fields: Record<string, string>;
  /** Everything the server added, e.g. { methods } on MFA_REQUIRED. */
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {},
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

type Query = Record<string, string | number | undefined>;

function withQuery(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

/** Reads the API error body. Falls back to a generic message when the body isn't in the expected shape. */
async function readError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: {
        code?: string;
        message?: string;
        details?: { fields?: Record<string, string> } & Record<string, unknown>;
      };
    };
    return new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? `The request failed (${response.status}).`,
      body.error?.details?.fields ?? {},
      body.error?.details ?? {},
    );
  } catch {
    return new ApiError(response.status, 'UNKNOWN', `The request failed (${response.status}).`);
  }
}

/** GET a public or signed-in endpoint. Pass `token` for signed-in requests. */
export async function apiGet<T>(
  path: string,
  query?: Query,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(withQuery(path, query), { headers });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as T;
}

/** POST a JSON body and return the parsed answer. */
export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(withQuery(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as T;
}

/** Send a JSON request with an optional bearer token. Returns null when the answer has no body. */
export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  token?: string,
): Promise<T | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(withQuery(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw await readError(response);
  }
  // 202 and 204 answers can have no body, so read it as text first.
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}
