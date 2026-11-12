'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAdmin } from '@/components/admin/context';
import {
  AdminModal,
  ErrorBox,
  OrderPill,
  Pager,
  Pill,
  useDebounced,
  useRun,
} from '@/components/admin/kit';
import { termName } from '@/components/admin/order-modals';
import { fmtDate, yuan } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { AdminUserDetail, AdminUserRow, Paged } from '@/lib/admin-types';

const PAGE = 20;

function UserModal({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAdmin();
  const { run, busy } = useRun();
  const { data: u, error, reload } = useApi<AdminUserDetail>(id ? `/admin/users/${id}` : null);
  return (
    <AdminModal open={!!id} onClose={onClose} wide>
      <h3>用户详情</h3>
      {error && <ErrorBox error={error} />}
      {u && id && (
        <>
          <dl className="kv" style={{ margin: '16px 0' }}>
            <dt>邮箱</dt>
            <dd>
              {u.email} {u.status === 'disabled' && <Pill tone="danger">已禁用</Pill>}
            </dd>
            <dt>微信</dt>
            <dd>{u.wechat || '—'}</dd>
            <dt>Telegram</dt>
            <dd>{u.telegram || '—'}</dd>
            <dt>注册时间</dt>
            <dd>{fmtDate(u.createdAt)}</dd>
          </dl>
          <h4 style={{ fontSize: 13, margin: '8px 0' }}>设备（{u.leases.length}）</h4>
          <div className="tw" style={{ marginBottom: 14 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>设备</th>
                  <th>固定 IP</th>
                  <th>租期</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {u.leases.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.deviceCode}</td>
                    <td className="mono">{l.publicIp}</td>
                    <td>
                      {fmtDate(l.startAt)} → {fmtDate(l.endAt)}
                    </td>
                    <td>{l.status}</td>
                  </tr>
                ))}
                {u.leases.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      暂无设备
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h4 style={{ fontSize: 13, margin: '8px 0' }}>订单（{u.orders.length}）</h4>
          <div className="tw" style={{ marginBottom: 14 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>套餐</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>创建</th>
                </tr>
              </thead>
              <tbody>
                {u.orders.map((o) => (
                  <tr key={o.no}>
                    <td className="mono">{o.no}</td>
                    <td>
                      {o.kind === 'renew' ? '续费 · ' : ''}
                      {termName(o.term)} × {o.quantity}
                    </td>
                    <td>{yuan(o.totalCents)}</td>
                    <td>
                      <OrderPill status={o.status} />
                    </td>
                    <td>{fmtDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {can('admin') && (
            <button
              className={`btn btn-sm ${u.status === 'disabled' ? 'btn-primary' : 'btn-line'}`}
              disabled={busy}
              onClick={async () => {
                const to = u.status === 'disabled' ? 'active' : 'disabled';
                if (to === 'disabled' && !confirm('禁用后该用户立即被踢下线且无法登录，确定？'))
                  return;
                const r = await run(
                  () => api(`/admin/users/${id}`, { method: 'PATCH', body: { status: to } }),
                  to === 'disabled' ? '已禁用' : '已启用',
                );
                if (r !== undefined) {
                  void reload();
                  onChanged();
                }
              }}
            >
              {u.status === 'disabled' ? '启用账号' : '禁用账号'}
            </button>
          )}
        </>
      )}
    </AdminModal>
  );
}

export default function UsersPage() {
  const [kw, setKw] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const keyword = useDebounced(kw);
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (keyword) qs.set('keyword', keyword);
  const { data, error, reload } = useApi<Paged<AdminUserRow>>(`/admin/users?${qs}`);
  return (
    <>
      <div className="bar-h">
        <input
          className="input"
          style={{ height: 30, width: 260, fontSize: 12.5 }}
          placeholder="搜索邮箱 / 微信 / Telegram"
          value={kw}
          onChange={(e) => {
            setKw(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>邮箱</th>
                <th>联系方式</th>
                <th>订单</th>
                <th>在租设备</th>
                <th>状态</th>
                <th>注册</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    {[u.wechat && `微信 ${u.wechat}`, u.telegram && `TG ${u.telegram}`]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td>{u.orderCount}</td>
                  <td>{u.activeDevices}</td>
                  <td>
                    {u.status === 'disabled' ? (
                      <Pill tone="danger">已禁用</Pill>
                    ) : (
                      <Pill tone="ok">正常</Pill>
                    )}
                  </td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>
                    <button className="btn btn-ghost xs" onClick={() => setSel(u.id)}>
                      详情
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    没有用户
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={7} className="empty">
                    加载中…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
        </div>
      )}
      <UserModal id={sel} onClose={() => setSel(null)} onChanged={() => void reload()} />
    </>
  );
}
