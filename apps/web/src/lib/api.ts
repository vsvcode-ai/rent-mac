export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: unknown,
  ) {
    super(message);
  }
}

/** 同源调用后端（next.config.mjs 里把 /api 转发到 NestJS）。Cookie 由浏览器自动携带。 */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const d = data as { message?: string | string[]; issues?: unknown } | undefined;
    const msg = Array.isArray(d?.message) ? d.message.join('；') : d?.message;
    throw new ApiError(msg ?? `请求失败（${res.status}）`, res.status, d?.issues);
  }
  return data as T;
}
