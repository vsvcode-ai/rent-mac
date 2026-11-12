'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DEVICE_STATUSES, DEVICE_STATUS_LABEL, type DeviceStatus } from '@nyd/shared';
import { api } from '@/lib/api';
import { useAdmin } from '@/components/admin/context';
import {
  CredentialModal,
  ImportModal,
  ResetCredentialModal,
  TokenModal,
} from '@/components/admin/device-modals';
import { DevicePill, ErrorBox, Pager, useDebounced, useRun } from '@/components/admin/kit';
import { fmtDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { DeviceRow, DevicesResponse } from '@/lib/admin-types';

const PAGE = 50;
const MANUAL: DeviceStatus[] = ['idle', 'maintenance', 'fault', 'retired'];

function Online({ v }: { v: boolean | null | undefined }) {
  if (v == null) return <span className="muted">未接入</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <i
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: v ? 'var(--sig)' : 'var(--st-danger)',
        }}
      />
      {v ? '在线' : '离线'}
    </span>
  );
}

export default function DevicesPage() {
  const sp = useSearchParams();
  const { can } = useAdmin();
  const { run } = useRun();
  const [status, setStatus] = useState<string>(sp.get('status') ?? '');
  const [kw, setKw] = useState('');
  const [page, setPage] = useState(1);
  const [imp, setImp] = useState(false);
  const [view, setView] = useState<DeviceRow | null>(null);
  const [reset, setReset] = useState<DeviceRow | null>(null);
  const [tok, setTok] = useState<DeviceRow | null>(null);
  const keyword = useDebounced(kw);
  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE) });
  if (status) qs.set('status', status);
  if (keyword) qs.set('keyword', keyword);
  const { data, error, reload } = useApi<DevicesResponse>(`/admin/devices?${qs}`);
  const ops = can('ops');
  const summary = data?.summary ?? {};
  const totalAll = Object.values(summary).reduce((a, b) => a + b, 0);

  const change = (d: DeviceRow, to: string) => {
    if (!to) return;
    const note =
      to === 'idle'
        ? undefined
        : (prompt(
            `把 ${d.code} 改为「${DEVICE_STATUS_LABEL[to as DeviceStatus]}」，备注原因（可留空）：`,
          ) ?? undefined);
    if (note === undefined && to !== 'idle') return;
    void run(
      () =>
        api(`/admin/devices/${d.id}/status`, {
          method: 'PATCH',
          body: { status: to, note: note || undefined },
        }),
      '状态已更新',
    ).then(() => reload());
  };

  return (
    <>
      <div className="bar-h">
        <span
          className={`chip ${!status ? 'on' : ''}`}
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
        >
          全部<em>{totalAll}</em>
        </span>
        {DEVICE_STATUSES.filter((s) => (summary[s] ?? 0) > 0 || status === s).map((s) => (
          <span
            key={s}
            className={`chip ${status === s ? 'on' : ''}`}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {DEVICE_STATUS_LABEL[s]}
            <em>{summary[s] ?? 0}</em>
          </span>
        ))}
        {(summary.offline ?? 0) > 0 && (
          <span className="chip" style={{ color: 'var(--st-danger)' }}>
            离线<em>{summary.offline}</em>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <input
          className="input"
          style={{ height: 30, width: 220, fontSize: 12.5 }}
          placeholder="编号 / 序列号 / IP"
          value={kw}
          onChange={(e) => {
            setKw(e.target.value);
            setPage(1);
          }}
        />
        {ops && (
          <button className="btn btn-dark btn-sm" onClick={() => setImp(true)}>
            批量导入
          </button>
        )}
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr>
                <th>编号</th>
                <th>机柜位置</th>
                <th>固定 IP</th>
                <th>序列号</th>
                <th>状态</th>
                <th>在线</th>
                <th>当前租户</th>
                <th>到期</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((d) => (
                <tr key={d.id}>
                  <td className="mono">
                    <b>{d.code}</b>
                    {d.note && <small>{d.note}</small>}
                  </td>
                  <td className="mono">{d.rackLocation}</td>
                  <td className="mono">{d.publicIp}</td>
                  <td className="mono">{d.serial}</td>
                  <td>
                    <DevicePill status={d.status} />
                  </td>
                  <td>
                    <Online v={d.online} />
                  </td>
                  <td>{d.lessee || '—'}</td>
                  <td>{d.endAt ? fmtDate(d.endAt) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {ops && (
                      <>
                        {d.leaseId && (
                          <button className="btn btn-ghost xs" onClick={() => setView(d)}>
                            凭证
                          </button>
                        )}{' '}
                        {d.leaseId && (
                          <button className="btn btn-ghost xs" onClick={() => setReset(d)}>
                            重置
                          </button>
                        )}{' '}
                        <button className="btn btn-ghost xs" onClick={() => setTok(d)}>
                          心跳
                        </button>{' '}
                        <select
                          className="input"
                          style={{ height: 26, width: 86, fontSize: 12, padding: '0 6px' }}
                          value=""
                          onChange={(e) => change(d, e.target.value)}
                        >
                          <option value="">改状态</option>
                          {MANUAL.filter((s) => s !== d.status).map((s) => (
                            <option key={s} value={s}>
                              {DEVICE_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    没有符合条件的机器
                  </td>
                </tr>
              )}
              {!data && (
                <tr>
                  <td colSpan={9} className="empty">
                    加载中…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {data && <Pager page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
        </div>
      )}
      <ImportModal open={imp} onClose={() => setImp(false)} onDone={() => void reload()} />
      <CredentialModal
        leaseId={view?.leaseId ?? null}
        code={view?.code ?? ''}
        onClose={() => setView(null)}
      />
      <ResetCredentialModal
        leaseId={reset?.leaseId ?? null}
        code={reset?.code ?? ''}
        onClose={() => setReset(null)}
      />
      <TokenModal
        deviceId={tok?.id ?? null}
        code={tok?.code ?? ''}
        onClose={() => {
          setTok(null);
          void reload();
        }}
      />
    </>
  );
}
