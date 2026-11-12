'use client';
import { useEffect, useState } from 'react';
import { MAX_QTY_PER_ORDER, type Term } from '@nyd/shared';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAdmin } from '@/components/admin/context';
import {
  AdminModal,
  ErrorBox,
  Loading,
  Pager,
  ROLE_LABEL,
  centsToYuanStr,
  errText,
  useRun,
  yuanStrToCents,
} from '@/components/admin/kit';
import { termName } from '@/components/admin/order-modals';
import { fmtTime, yuan } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { uploadImage } from '@/lib/upload';
import type { AdminListItem, AuditItem, Paged, SettingsResponse } from '@/lib/admin-types';

const ROLES: [string, 0 | 1, 0 | 1, 0 | 1][] = [
  ['查看订单', 1, 1, 1],
  ['核对收款 / 确认收款', 1, 0, 1],
  ['分配机器 / 开通', 0, 1, 1],
  ['查看用户凭证', 0, 1, 1],
  ['退款登记', 0, 0, 1],
  ['修改价格 / 设置', 0, 0, 1],
  ['回收机器', 0, 1, 1],
];

function ImageField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  label: string;
}) {
  const toast = useToast();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {value ? (
        <img
          src={value}
          alt={label}
          style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            background: '#fff',
            objectFit: 'contain',
          }}
        />
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>
          未上传
        </span>
      )}
      <label
        className={`btn btn-line xs${disabled ? ' disabled' : ''}`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        {value ? '更换' : '上传'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              onChange(await uploadImage(f));
              toast('图片已上传，保存后生效');
            } catch (err) {
              toast(errText(err));
            }
          }}
        />
      </label>
    </div>
  );
}

function AuditLog() {
  const [page, setPage] = useState(1);
  const { data, error } = useApi<Paged<AuditItem>>(`/admin/audit-logs?page=${page}&pageSize=15`);
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <div className="todo" style={{ fontSize: 12.5 }}>
        {data?.items.map((a) => (
          <div key={a.id} className="todo-i" style={{ flexWrap: 'wrap' }}>
            <span className="mono">{fmtTime(a.createdAt)}</span>
            <b>{a.adminName}</b>
            <span>{a.action}</span>
            <span className="muted mono">{a.target}</span>
            {a.ip && <span className="muted mono">{a.ip}</span>}
          </div>
        ))}
        {data && data.items.length === 0 && <div className="todo-i muted">暂无记录</div>}
      </div>
      {data && <Pager page={page} pageSize={15} total={data.total} onPage={setPage} />}
    </>
  );
}

function Admins() {
  const { admin } = useAdmin();
  const { run } = useRun();
  const { data, error } = useApi<AdminListItem[]>('/admin/admins');
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="tw" style={{ border: 0 }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>管理员</th>
            <th>角色</th>
            <th>两步验证</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.map((a) => (
            <tr key={a.id}>
              <td>
                {a.name}
                <small>{a.email}</small>
              </td>
              <td>{ROLE_LABEL[a.role]}</td>
              <td>{a.totpEnabled ? '已绑定' : '未绑定'}</td>
              <td>
                {a.id !== admin.id && (
                  <button
                    className="btn btn-ghost xs"
                    onClick={() => {
                      if (
                        confirm(
                          `重置 ${a.name} 的两步验证？对方会被立即踢下线，下次登录需重新绑定。`,
                        )
                      ) {
                        void run(
                          () => api(`/admin/admins/${a.id}/reset-totp`, { method: 'POST' }),
                          '已重置',
                        );
                      }
                    }}
                  >
                    重置两步验证
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsPage() {
  const { can } = useAdmin();
  const { run, busy } = useRun();
  const { data, error, loading, reload } = useApi<SettingsResponse>('/admin/settings');
  const isAdmin = can('admin');
  const [price, setPrice] = useState<Record<string, string>>({});
  const [url, setUrl] = useState<Record<string, string>>({});
  const [qr, setQr] = useState<Record<string, string>>({});
  const [wechat, setWechat] = useState('');
  const [telegram, setTelegram] = useState('');
  const [wechatQr, setWechatQr] = useState('');
  const [deadline, setDeadline] = useState('7');
  const [grace, setGrace] = useState('3');
  const [pending, setPending] = useState('48');
  const [sync, setSync] = useState<
    { term: Term; oldCents: number; newCents: number; months: number }[] | null
  >(null);

  useEffect(() => {
    if (!data) return;
    setPrice(Object.fromEntries(data.plans.map((p) => [p.term, centsToYuanStr(p.monthlyCents)])));
    setUrl(Object.fromEntries(data.plans.map((p) => [p.term, p.xianyuUrl ?? ''])));
    setQr(Object.fromEntries(data.plans.map((p) => [p.term, p.xianyuQrImage ?? ''])));
    const s = data.settings;
    setWechat(String(s['support.wechat'] ?? ''));
    setTelegram(String(s['support.telegram'] ?? ''));
    setWechatQr(String(s['support.wechatQr'] ?? ''));
    setDeadline(String(s['activation.deadlineDays'] ?? 7));
    setGrace(String(s['lease.graceDays'] ?? 3));
    setPending(String(s['order.pendingExpireHours'] ?? 48));
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const save = async () => {
    const r = await run(
      () =>
        api<{ needXianyuSync: { term: Term; oldCents: number; newCents: number }[] }>(
          '/admin/settings',
          {
            method: 'PUT',
            body: {
              plans: data.plans.map((p) => ({
                term: p.term,
                monthlyCents: yuanStrToCents(price[p.term] ?? ''),
                xianyuUrl: url[p.term] ?? '',
                xianyuQrImage: qr[p.term] ?? '',
              })),
              support: { wechat, telegram, wechatQr },
              activationDeadlineDays: Number(deadline),
              graceDays: Number(grace),
              pendingExpireHours: Number(pending),
            },
          },
        ),
      '设置已保存',
    );
    if (r) {
      if (r.needXianyuSync.length)
        setSync(
          r.needXianyuSync.map((x) => ({
            ...x,
            months: data.plans.find((p) => p.term === x.term)!.months,
          })),
        );
      void reload();
    }
  };
  const dis = !isAdmin;

  return (
    <>
      {dis && <div className="note-tip">只有管理员可以修改设置，当前为只读。</div>}
      <div className="g2" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="box">
          <h3>价格与闲鱼商品</h3>
          <div
            className="set-row"
            style={{
              fontSize: 12,
              color: 'var(--ink3)',
              gridTemplateColumns: '130px 110px 1fr 130px',
            }}
          >
            <span>租期</span>
            <span>每月单价（¥）</span>
            <span>闲鱼商品链接</span>
            <span>闲鱼二维码</span>
          </div>
          {data.plans.map((p) => (
            <div
              className="set-row"
              key={p.term}
              style={{ gridTemplateColumns: '130px 110px 1fr 130px' }}
            >
              <b>
                {termName(p.term)}（{p.months} 个月）
              </b>
              <input
                className="input"
                disabled={dis}
                inputMode="decimal"
                value={price[p.term] ?? ''}
                onChange={(e) => setPrice({ ...price, [p.term]: e.target.value })}
              />
              <input
                className="input"
                disabled={dis}
                placeholder="https://"
                value={url[p.term] ?? ''}
                onChange={(e) => setUrl({ ...url, [p.term]: e.target.value })}
              />
              <ImageField
                label={`${termName(p.term)}二维码`}
                disabled={dis}
                value={qr[p.term] ?? ''}
                onChange={(v) => setQr({ ...qr, [p.term]: v })}
              />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            改价只对新订单生效。改价后请同步修改闲鱼商品价格，闲鱼标价 = 每月单价 × 月数。
          </p>
          <h3 style={{ marginTop: 26 }}>联系方式与时限</h3>
          <div className="set-row">
            <span>客服微信</span>
            <input
              className="input"
              disabled={dis}
              value={wechat}
              onChange={(e) => setWechat(e.target.value)}
            />
            <span className="muted">显示在客服浮窗</span>
          </div>
          <div className="set-row">
            <span>客服微信二维码</span>
            <ImageField
              label="客服微信二维码"
              disabled={dis}
              value={wechatQr}
              onChange={setWechatQr}
            />
            <span />
          </div>
          <div className="set-row">
            <span>Telegram</span>
            <input
              className="input"
              disabled={dis}
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
            />
            <span className="muted">仅作联系方式展示</span>
          </div>
          <div className="set-row">
            <span>开通时限（天）</span>
            <input
              className="input"
              disabled={dis}
              inputMode="numeric"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <span className="muted">从确认收款起算，超期自动标红</span>
          </div>
          <div className="set-row">
            <span>宽限期（天）</span>
            <input
              className="input"
              disabled={dis}
              inputMode="numeric"
              value={grace}
              onChange={(e) => setGrace(e.target.value)}
            />
            <span className="muted">到期后保留机器</span>
          </div>
          <div className="set-row">
            <span>未付款自动取消（小时）</span>
            <input
              className="input"
              disabled={dis}
              inputMode="numeric"
              value={pending}
              onChange={(e) => setPending(e.target.value)}
            />
            <span className="muted" />
          </div>
          <div className="set-row">
            <span>单笔台数上限</span>
            <input className="input" disabled value={MAX_QTY_PER_ORDER} readOnly />
            <span className="muted">由代码决定，修改需发版；超过走咨询</span>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            disabled={dis || busy}
            onClick={save}
          >
            保存设置
          </button>
        </div>
        <div className="box">
          <h3>角色与权限</h3>
          <div className="tw" style={{ border: 0 }}>
            <table className="tbl perm">
              <thead>
                <tr>
                  <th>权限</th>
                  <th>客服</th>
                  <th>运维</th>
                  <th>管理员</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td>
                    {r.slice(1).map((v, i) => (
                      <td key={i}>
                        {v ? (
                          <span style={{ color: 'var(--ok)' }}>●</span>
                        ) : (
                          <span style={{ color: 'var(--ink3)' }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
            查看凭证、确认收款、退款、改价都会写入审计日志。
          </p>
          {isAdmin && (
            <>
              <h3 style={{ marginTop: 22 }}>管理员</h3>
              <Admins />
              <h3 style={{ marginTop: 22 }}>审计日志</h3>
              <AuditLog />
            </>
          )}
        </div>
      </div>
      <AdminModal open={!!sync} onClose={() => setSync(null)}>
        <h3>请同步修改闲鱼商品价格</h3>
        <p className="muted" style={{ fontSize: 13.5 }}>
          网站价格已更新。闲鱼商品价格需要运营手动改成下面的新标价，否则用户付款时会出现金额不一致。
        </p>
        <dl className="kv" style={{ margin: '16px 0' }}>
          {sync?.map((s) => (
            <div key={s.term} style={{ display: 'contents' }}>
              <dt>{termName(s.term)}</dt>
              <dd>
                {yuan(s.oldCents * s.months)} → <b>{yuan(s.newCents * s.months)}</b>（
                {yuan(s.newCents)}/月 × {s.months}）
              </dd>
            </div>
          ))}
        </dl>
        <button className="btn btn-primary btn-block" onClick={() => setSync(null)}>
          知道了
        </button>
      </AdminModal>
    </>
  );
}
