'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { Me } from './types';

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => Promise<void>;
}

/** 轻量取数 hook：path 为 null 时不请求。reload() 可手动刷新。 */
export function useApi<T>(path: string | null): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(path !== null);
  const load = useCallback(async () => {
    if (path === null) return;
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}

/** 当前登录用户：undefined = 加载中，null = 未登录 */
export function useMe(): { me: Me | null | undefined; reload: () => Promise<void> } {
  const { data, error, loading, reload } = useApi<Me>('/me');
  const me = loading ? undefined : error?.status === 401 ? null : (data ?? null);
  return { me, reload };
}

/** 未登录时跳到登录页，登录后回跳 */
export function useRequireLogin() {
  const r = useMe();
  useEffect(() => {
    if (r.me === null) {
      const next = location.pathname + location.search + location.hash;
      location.replace(`/auth?next=${encodeURIComponent(next)}`);
    }
  }, [r.me]);
  return r;
}
