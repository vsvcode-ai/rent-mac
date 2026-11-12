'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useCopy } from '@/components/Toast';
import type { Credential } from '@/lib/types';
import type { ImportResult } from '@/lib/admin-types';
import { AdminModal, errText, useRun } from './kit';

/** 查看凭证：先二次确认（会留日志），再 POST 取明文 */
export function CredentialModal({
  leaseId,
  code,
  onClose,
}: {
  leaseId: string | null;
  code: string;
  onClose: () => void;
}) {
  const { run, busy } = useRun();
  const copy = useCopy();
  const [cred, setCred] = useState<Credential | null>(null);
  useEffect(() => setCred(null), [leaseId]);
  const rows: [string, keyof Credential][] = [
    ['UU 设备代码', 'uuDeviceCode'],
    ['UU 连接密码', 'uuPassword'],
    ['macOS 用户名', 'macUsername'],
    ['macOS 登录密码', 'macPassword'],
  ];
  return (
    <AdminModal open={!!leaseId} onClose={onClose}>
      <h3>查看连接凭证</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {code}
      </p>
      {!cred ? (
        <>
          <div className="note-tip" style={{ marginTop: 14 }}>
            查看凭证会写入查看记录和审计日志（含你的账号和 IP）。仅在处理工单等必要场景下查看。
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={async () => {
              const r = await run(() =>
                api<Credential>(`/admin/leases/${leaseId}/credential`, { method: 'POST' }),
              );
              if (r) setCred(r);
            }}
          >
            我已了解，查看凭证
          </button>
        </>
      ) : (
        <dl className="kv" style={{ margin: '16px 0 0' }}>
          {rows.map(([label, k]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd className="mono">
                {cred[k]}{' '}
                <button className="btn btn-ghost xs" onClick={() => copy(cred[k])}>
                  复制
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </AdminModal>
  );
}

/** 重置凭证（重置密码类工单）：只提交填写了的字段 */
export function ResetCredentialModal({
  leaseId,
  code,
  onClose,
}: {
  leaseId: string | null;
  code: string;
  onClose: () => void;
}) {
  const { run, busy } = useRun();
  const [f, setF] = useState({
    uuDeviceCode: '',
    uuPassword: '',
    macUsername: '',
    macPassword: '',
  });
  useEffect(
    () => setF({ uuDeviceCode: '', uuPassword: '', macUsername: '', macPassword: '' }),
    [leaseId],
  );
  const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const fields: [string, keyof typeof f][] = [
    ['UU 设备代码', 'uuDeviceCode'],
    ['UU 连接密码', 'uuPassword'],
    ['macOS 用户名', 'macUsername'],
    ['macOS 登录密码', 'macPassword'],
  ];
  return (
    <AdminModal open={!!leaseId} onClose={onClose}>
      <h3>重置凭证</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {code} · 只填需要修改的字段，用户会收到站内通知。请先在机器上完成实际修改。
      </p>
      <div style={{ marginTop: 14 }}>
        {fields.map(([label, k]) => (
          <div className="field" key={k}>
            <label>{label}</label>
            <input
              className="input mono"
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button
        className="btn btn-primary btn-block"
        disabled={busy || Object.keys(body).length === 0}
        onClick={async () => {
          if (
            (await run(
              () => api(`/admin/leases/${leaseId}/credential`, { method: 'PUT', body }),
              '凭证已更新，已通知用户',
            )) !== undefined
          )
            onClose();
        }}
      >
        保存
      </button>
    </AdminModal>
  );
}

/** 生成心跳 token：明文只显示这一次 */
export function TokenModal({
  deviceId,
  code,
  onClose,
}: {
  deviceId: string | null;
  code: string;
  onClose: () => void;
}) {
  const { run, busy } = useRun();
  const copy = useCopy();
  const [token, setToken] = useState('');
  useEffect(() => setToken(''), [deviceId]);
  return (
    <AdminModal open={!!deviceId} onClose={onClose}>
      <h3>心跳 token</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        {code}
      </p>
      {!token ? (
        <>
          <div className="note-tip" style={{ marginTop: 14 }}>
            生成后旧 token 立即作废。机器上的心跳 agent 用请求头{' '}
            <span className="mono">X-Device-Token</span> 上报。明文只显示一次，关闭后无法找回。
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={async () => {
              const r = await run(() =>
                api<{ token: string }>(`/admin/devices/${deviceId}/token`, { method: 'POST' }),
              );
              if (r) setToken(r.token);
            }}
          >
            生成新 token
          </button>
        </>
      ) : (
        <>
          <div
            className="dblock mono"
            style={{ margin: '14px 0', wordBreak: 'break-all', fontSize: 13 }}
          >
            {token}
          </div>
          <button className="btn btn-line btn-block" onClick={() => copy(token, 'token 已复制')}>
            复制
          </button>
          <p className="fine">请立即保存到机器上的 agent 配置里，此窗口关闭后不再显示。</p>
        </>
      )}
    </AdminModal>
  );
}

const HEADERS = ['设备编号（可空）', '序列号', '机柜位置', '固定IP', '备注'] as const;
interface Row {
  code?: string;
  serial: string;
  rackLocation: string;
  publicIp: string;
  note?: string;
}

/** Excel 批量导入：浏览器里解析 → dryRun 预检 → 正式导入 */
export function ImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { run, busy } = useRun();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setRows([]);
      setFileName('');
      setCheck(null);
      setErr('');
    }
  }, [open]);

  const template = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      [...HEADERS],
      ['', 'C02XXXXXXXXX', 'R01-01', '103.17.2.3', '示例行，导入前请删除'],
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '机器台账');
    XLSX.writeFile(wb, '南洋桌面-机器导入模板.xlsx');
  };

  const onFile = async (f: File) => {
    setErr('');
    setCheck(null);
    setFileName(f.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) throw new Error('文件里没有工作表');
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
      const pick = (r: Record<string, unknown>, ...keys: string[]) => {
        for (const k of keys) {
          const hit = Object.keys(r).find((h) => h.replace(/\s/g, '').startsWith(k));
          if (hit && String(r[hit]).trim()) return String(r[hit]).trim();
        }
        return '';
      };
      const parsed: Row[] = raw
        .map((r) => ({
          code: pick(r, '设备编号', 'code') || undefined,
          serial: pick(r, '序列号', 'serial'),
          rackLocation: pick(r, '机柜位置', '机柜', 'rack'),
          publicIp: pick(r, '固定IP', '固定 IP', 'IP', 'ip'),
          note: pick(r, '备注', 'note') || undefined,
        }))
        .filter((r) => r.serial || r.rackLocation || r.publicIp);
      if (parsed.length === 0) throw new Error('没有读到数据行，请使用下载的模板');
      if (parsed.length > 1000) throw new Error('一次最多导入 1000 台');
      setRows(parsed);
      const r = await api<ImportResult>('/admin/devices/import', {
        body: { rows: parsed, dryRun: true },
      });
      setCheck(r);
    } catch (e) {
      setRows([]);
      setErr(errText(e));
    }
  };

  const ok = check && check.errors.length === 0 && rows.length > 0;
  return (
    <AdminModal open={open} onClose={onClose} wide>
      <h3>批量导入机器</h3>
      <p className="muted" style={{ fontSize: 13.5 }}>
        先下载模板，按列填写后上传。系统会先逐行预检，全部通过才能导入（有错一台都不会写入）。
      </p>
      <div
        style={{
          display: 'flex',
          gap: 8,
          margin: '14px 0',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button className="btn btn-line btn-sm" onClick={template}>
          下载模板 .xlsx
        </button>
        <label className="btn btn-dark btn-sm" style={{ cursor: 'pointer' }}>
          选择文件
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
          />
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {fileName}
        </span>
      </div>
      {err && <p style={{ color: 'var(--st-danger)', fontSize: 13 }}>{err}</p>}
      {check && (
        <div className="note-tip">
          共读取 {rows.length} 行，通过 {check.valid} 行
          {check.errors.length > 0 ? `，${check.errors.length} 行有问题` : '，全部通过 ✓'}
        </div>
      )}
      {check && check.errors.length > 0 && (
        <div className="tw" style={{ maxHeight: '30vh', marginBottom: 12 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>数据行</th>
                <th>问题</th>
              </tr>
            </thead>
            <tbody>
              {check.errors.map((e, i) => (
                <tr key={i}>
                  <td className="mono">
                    第 {e.row} 行（Excel 第 {e.row + 1} 行）
                  </td>
                  <td style={{ color: 'var(--st-danger)' }}>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        className="btn btn-primary btn-block"
        disabled={busy || !ok}
        onClick={async () => {
          const r = await run(
            () => api<ImportResult>('/admin/devices/import', { body: { rows } }),
            '导入完成',
          );
          if (r) {
            if (r.errors.length) setCheck(r);
            else {
              onDone();
              onClose();
            }
          }
        }}
      >
        确认导入 {ok ? `${rows.length} 台` : ''}
      </button>
    </AdminModal>
  );
}
