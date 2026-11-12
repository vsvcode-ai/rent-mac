'use client';
import { useState } from 'react';
import { Modal } from './Modal';
import { useApi } from '@/lib/hooks';
import type { PublicSettings } from '@/lib/types';

export function SupportFab() {
  const [open, setOpen] = useState(false);
  const { data: s } = useApi<PublicSettings>('/settings/public');
  return (
    <>
      <button className="fab" onClick={() => setOpen(true)}>
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
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
        联系客服
      </button>
      <Modal open={open} onClose={() => setOpen(false)} center>
        <h3>联系客服</h3>
        {s?.supportWechatQr ? (
          <>
            <p className="muted" style={{ fontSize: 14.5 }}>
              扫码添加微信，请备注「<b style={{ color: 'var(--ink)' }}>南洋桌面</b>」
            </p>
            <div className="qr">
              <img src={s.supportWechatQr} alt="客服微信二维码" />
            </div>
          </>
        ) : null}
        {s?.supportWechat && (
          <p className="muted" style={{ fontSize: 13 }}>
            微信：
            <b className="mono" style={{ color: 'var(--ink)' }}>
              {s.supportWechat}
            </b>
          </p>
        )}
        {s?.supportTelegram && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 18,
              borderTop: '1px solid var(--line)',
              fontSize: 14,
            }}
            className="muted"
          >
            Telegram <b style={{ color: 'var(--ink)' }}>{s.supportTelegram}</b>
          </div>
        )}
        {s && !s.supportWechat && !s.supportTelegram && (
          <p className="muted">客服联系方式暂未配置。</p>
        )}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          服务时间：每天 10:00–23:00（UTC+8）
        </p>
      </Modal>
    </>
  );
}
