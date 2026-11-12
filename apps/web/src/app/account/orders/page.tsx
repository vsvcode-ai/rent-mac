'use client';
import { OrdersTable } from '@/components/account/OrdersTable';
import { useApi } from '@/lib/hooks';
import type { OrderView } from '@/lib/types';

export default function OrdersPage() {
  const { data, loading, error } = useApi<OrderView[]>('/me/orders');
  return (
    <>
      <h2>我的订单</h2>
      {loading ? (
        <p className="muted">加载中…</p>
      ) : error ? (
        <div className="alert danger">
          <span>!</span>
          <div>{error.message}</div>
        </div>
      ) : (
        <OrdersTable list={data ?? []} />
      )}
    </>
  );
}
