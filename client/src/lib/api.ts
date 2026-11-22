import { t, tMaybe } from './i18n';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('crm:unauthorized'));
    }
    const detail = data.details?.[0];
    const error = data.error ? tMaybe(data.error) : undefined;
    const message = detail ? `${error} : ${detail.path ? detail.path + ' – ' : ''}${tMaybe(detail.message)}` : error;
    throw new ApiError(res.status, message ?? t('Erreur {n}', { n: res.status }), data.details);
  }
  return data as T;
}

export function toQuery(params: Record<string, string | number | undefined | null | false>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : t('Une erreur est survenue'));
