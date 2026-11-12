'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { NotificationItem } from '@/lib/types';

export function Bell() {
  const { data, reload } = useApi<{ unread: number; items: NotificationItem[] }>(
    '/me/notifications',
  );
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    // 打开即视为已读
    if (next && data?.unread) {
      await api('/me/notifications/read', { method: 'PATCH' }).catch(() => undefined);
      void reload();
    }
  };
  const unread = data?.unread ?? 0;
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={toggle}
        aria-label={`通知${unread ? `，${unread} 条未读` : ''}`}
        style={{ position: 'relative' }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: 'var(--st-danger)',
              color: '#fff',
              fontSize: 10,
              lineHeight: '16px',
              textAlign: 'center',
              padding: '0 4px',
            }}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="bell-pop">
          {data?.items.length ? (
            data.items.slice(0, 20).map((n) => (
              <div
                key={n.id}
                style={{ padding: '10px 12px', borderRadius: 8, opacity: n.readAt ? 0.7 : 1 }}
              >
                <b style={{ fontSize: 13.5, display: 'block' }}>{n.subject}</b>
                <span
                  className="muted"
                  style={{ fontSize: 12.5, display: 'block', margin: '3px 0' }}
                >
                  {n.text}
                </span>
                <small className="muted" style={{ fontSize: 11.5 }}>
                  {ago(n.createdAt)}
                </small>
              </div>
            ))
          ) : (
            <p className="muted" style={{ padding: 16, fontSize: 13.5, textAlign: 'center' }}>
              暂无通知
            </p>
          )}
        </div>
      )}
    </div>
  );
}
