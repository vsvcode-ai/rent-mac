'use client';
import Link from 'next/link';
import { DeviceCard } from '@/components/account/DeviceCard';
import { useApi } from '@/lib/hooks';
import type { AccountLease } from '@/lib/account-types';

export default function DevicesPage() {
  const { data, loading, error } = useApi<AccountLease[]>('/me/leases');
  return (
    <>
      <h2>
        我的设备
        <Link className="btn btn-ghost btn-sm" href="/help">
          UU 远程连接教程
        </Link>
      </h2>
      {loading ? (
        <p className="muted">加载中…</p>
      ) : error ? (
        <div className="alert danger">
          <span>!</span>
          <div>{error.message}</div>
        </div>
      ) : !data?.length ? (
        <div className="tbl-wrap">
          <div className="empty">
            <b>还没有开通的设备</b>付款并开通后，连接信息会出现在这里。
          </div>
        </div>
      ) : (
        data.map((l) => <DeviceCard key={l.id} lease={l} />)
      )}
    </>
  );
}
