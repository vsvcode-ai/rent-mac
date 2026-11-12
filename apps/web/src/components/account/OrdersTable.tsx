import Link from 'next/link';
import { OrderPill } from './status';
import { fmtDate, yuan } from '@/lib/format';
import type { OrderView } from '@/lib/types';

const TERM_NAME = { m1: '月付', m3: '季付', m6: '半年付', m12: '年付' } as const;

export function OrdersTable({ list }: { list: OrderView[] }) {
  if (!list.length) {
    return (
      <div className="tbl-wrap">
        <div className="empty">
          <b>还没有订单</b>选一个套餐，开始你的第一台 Mac。
          <br />
          <Link className="btn btn-primary btn-sm" style={{ marginTop: 16 }} href="/#pricing">
            去选套餐
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>订单号</th>
            <th>类型</th>
            <th>套餐</th>
            <th>金额</th>
            <th>状态</th>
            <th>时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.no}>
              <td className="mono">{o.no}</td>
              <td>{o.kind === 'renew' ? '续费' : '新租'}</td>
              <td>
                {TERM_NAME[o.term]} × {o.quantity} 台
              </td>
              <td>
                <b>{yuan(o.totalCents)}</b>
              </td>
              <td>
                <OrderPill status={o.status} />
              </td>
              <td className="muted" style={{ fontSize: 13 }}>
                {fmtDate(o.createdAt)}
              </td>
              <td>
                {o.status === 'pending' ? (
                  <Link className="btn btn-primary btn-sm" href={`/order/${o.no}`}>
                    去付款
                  </Link>
                ) : o.status === 'failed' ? (
                  <Link className="btn btn-primary btn-sm" href={`/order/${o.no}`}>
                    重新提交
                  </Link>
                ) : (
                  <Link className="link" href={`/order/${o.no}`}>
                    详情
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
