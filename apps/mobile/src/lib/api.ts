import Constants from 'expo-constants';

const fallbackBaseUrl = 'https://tourneasy.com';

/** Website API base URL, from app.json `extra.apiBaseUrl`. */
function baseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return (extra?.apiBaseUrl ?? fallbackBaseUrl).replace(/\/+$/, '');
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const code = (data as { code?: unknown } | null)?.code;
    throw new ApiError(response.status, typeof code === 'string' ? code : 'UNKNOWN');
  }
  return data as T;
}

export function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  return request<T>('POST', path, body, token);
}

export function apiGet<T>(path: string, token?: string): Promise<T> {
  return request<T>('GET', path, undefined, token);
}
