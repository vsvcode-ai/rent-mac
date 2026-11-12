'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DEFAULT_PLANS, ORDER_STATUS_LABEL, type OrderStatus } from '@nyd/shared';
import { Modal } from '@/components/Modal';
import { useCopy, useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { fmtTime, yuan } from '@/lib/format';
import { useApi, useRequireLogin } from '@/lib/hooks';
import { SupportLink } from '@/lib/support';
import type { OrderView } from '@/lib/types';
import { OrderFlow } from '../OrderFlow';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const PILL: Record<OrderStatus, string> = {
  pending: 'warn',
  verifying: 'info',
  failed: 'danger',
  queued: 'brand',
  active: 'ok',
  done: 'mute',
  cancelled: 'mute',
  refunding: 'warn',
  refunded: 'mute',
  renewed: 'ok',
};
const STEP: Record<OrderStatus, number> = {
  pending: 1,
  failed: 1,
  cancelled: 1,
  verifying: 2,
  queued: 2,
  active: 3,
  done: 3,
  refunding: 3,
  refunded: 3,
  renewed: 3,
};

function Timeline({ o }: { o: OrderView }) {
  const st = o.status;
  const cls = (done: boolean, cur: boolean) => (done ? 'done' : cur ? 'cur' : 'todo');
  const paid = [
    'verifying',
    'queued',
    'active',
    'done',
    'renewed',
    'refunding',
    'refunded',
  ].includes(st);
  const ver = ['queued', 'active', 'done', 'renewed', 'refunding', 'refunded'].includes(st);
  const act = ['active', 'done', 'renewed'].includes(st);
  const renew = o.kind === 'renew';
  return (
    <ul className="timeline">
      <li className="done">
        <i></i>
        <b>订单已创建</b>
        <small>{fmtTime(o.createdAt)}</small>
      </li>
      <li className={cls(paid, st === 'pending' || st === 'failed')}>
        <i></i>
        <b>已在闲鱼付款</b>
        <small>{paid ? `闲鱼订单号 ${o.xianyuOrderNo}` : '等待你付款并回填闲鱼订单号'}</small>
      </li>
      <li className={cls(ver, st === 'verifying')}>
        <i></i>
        <b>客服核对收款</b>
        <small>
          {ver && o.paidAt
            ? `已确认收款 · ${fmtTime(o.paidAt)}`
            : st === 'verifying'
              ? '核对中，通常 24 小时内'
              : '付款后进行'}
        </small>
      </li>
      {renew ? (
        <li className={cls(st === 'renewed', false)}>
          <i></i>
          <b>到期时间延长</b>
          <small>{st === 'renewed' ? '已续费，到期时间已延长' : '确认收款后自动延长'}</small>
        </li>
      ) : (
        <>
          <li className={cls(act, st === 'queued')}>
            <i></i>
            <b>运维开通机器</b>
            <small>{act ? '已开通' : '确认收款后 7 天内完成'}</small>
          </li>
          <li className={act ? 'cur' : 'todo'}>
            <i></i>
            <b>连接使用</b>
            <small>{act ? '到「我的设备」查看连接信息' : '开通后获得 UU 远程连接信息'}</small>
          </li>
        </>
      )}
    </ul>
  );
}

function XianyuForm({ o, onDone }: { o: OrderView; onDone: () => void }) {
  const toast = useToast();
  const [no, setNo] = useState('');
  const [nick, setNick] = useState('');
  const [bad, setBad] = useState<{ no?: boolean; nick?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    const v = no.replace(/\s/g, '');
    const b = { no: !/^\d{10,}$/.test(v), nick: !nick.trim() };
    setBad(b);
    setErr('');
    if (b.no || b.nick) return;
    setBusy(true);
    try {
      await api(`/orders/${o.no}/xianyu`, {
        body: { xianyuOrderNo: v, xianyuBuyerNick: nick.trim() },
      });
      toast('已提交，客服核对中');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="row2">
        <div className={`field${bad.no ? ' bad' : ''}`}>
          <label htmlFor="xyno">闲鱼订单号</label>
          <input
            id="xyno"
            className={`input mono${bad.no ? ' err' : ''}`}
            placeholder="闲鱼「我买到的」里的订单号"
            inputMode="numeric"
            value={no}
            onChange={(e) => setNo(e.target.value)}
          />
          <div className="errmsg">请输入闲鱼订单号（10 位以上数字）</div>
        </div>
        <div className={`field${bad.nick ? ' bad' : ''}`}>
          <label htmlFor="xynick">闲鱼昵称</label>
          <input
            id="xynick"
            className={`input${bad.nick ? ' err' : ''}`}
            placeholder="方便客服核对"
            maxLength={64}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
          />
          <div className="errmsg">请填写闲鱼昵称</div>
        </div>
      </div>
      {err && (
        <div className="alert danger" role="alert" style={{ marginBottom: 14 }}>
          <span>!</span>
          <div>{err}</div>
        </div>
      )}
      <button className="btn btn-primary btn-lg" onClick={submit} disabled={busy}>
        {busy ? '提交中…' : o.status === 'failed' ? '重新提交核对' : '我已付款，提交核对'}
      </button>
    </>
  );
}

export default function OrderPage() {
  const { me } = useRequireLogin();
  const { no } = useParams<{ no: string }>();
  const router = useRouter();
  const toast = useToast();
  const copy = useCopy();
  const {
    data: o,
    error,
    loading,
    reload,
  } = useApi<OrderView>(me ? `/orders/${encodeURIComponent(no)}` : null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 每分钟刷新倒计时；核对 / 开通等待期间每 30 秒拉一次最新状态
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!o || !['verifying', 'queued'].includes(o.status)) return;
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [o, reload]);

  if (!me || loading)
    return (
      <div className="wrap page">
        <p className="muted">加载中…</p>
      </div>
    );
  if (error || !o) {
    return (
      <div className="wrap page">
        <div className="empty">
          <b>找不到这个订单</b>
          <Link className="btn btn-dark" href="/account/orders" style={{ marginTop: 14 }}>
            返回我的订单
          </Link>
        </div>
      </div>
    );
  }

  const plan = DEFAULT_PLANS.find((p) => p.term === o.term)!;
  const renew = o.kind === 'renew';
  const st = o.status;
  const left = o.expiresAt ? new Date(o.expiresAt).getTime() - now : 0;
  const unitTotal = o.unitCents * o.months;
  const urlOk = !!o.xianyuUrl && /^https?:\/\//.test(o.xianyuUrl);

  const doCancel = async () => {
    try {
      await api(`/orders/${o.no}/cancel`, { body: {} });
      toast('订单已取消');
      router.push('/account/orders');
    } catch (e) {
      toast((e as Error).message);
      setCancelOpen(false);
    }
  };

  let main: React.ReactNode;
  if (st === 'pending' || st === 'failed') {
    main = (
      <>
        {st === 'failed' ? (
          <div className="alert danger">
            <span>!</span>
            <div>
              <b>付款核对未通过</b>。{o.failedReason ? `原因：${o.failedReason}。` : ''}
              请核对闲鱼订单号后重新提交，或
              <SupportLink />。
            </div>
          </div>
        ) : left > 0 ? (
          <div className="alert warn">
            <span>!</span>
            <div>
              <b>请在 {Math.max(1, Math.round(left / HOUR))} 小时内完成付款</b>
              ，超时订单将自动取消。付款时务必在闲鱼留言填写下方订单号，否则客服无法匹配。
            </div>
          </div>
        ) : (
          <div className="alert danger">
            <span>!</span>
            <div>
              <b>订单已超时</b>，系统将自动取消。如已付款请
              <SupportLink />
              ，否则请重新下单。
            </div>
          </div>
        )}
        <div className="panel">
          <h3>
            <span className="n">1</span>先复制你的订单号
          </h3>
          <div className="copybox">
            <code>{o.no}</code>
            <button className="btn btn-dark btn-sm" onClick={() => copy(o.no, '订单号已复制')}>
              复制
            </button>
          </div>
        </div>
        <div className="panel">
          <h3>
            <span className="n">2</span>去闲鱼付款
          </h3>
          <div className="pay-hero">
            <div className="qr">
              {o.xianyuQrImage ? (
                <img src={o.xianyuQrImage} alt="闲鱼商品二维码，长按可保存" />
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'var(--on-ink)',
                  }}
                >
                  二维码暂未配置
                </div>
              )}
            </div>
            <div>
              <b style={{ fontSize: 17 }}>
                闲鱼商品 · Mac mini {renew ? '续费' : '租赁'}（{plan.name}）
              </b>
              <div className="muted" style={{ margin: '6px 0 14px', fontSize: 14 }}>
                手机长按二维码保存后用闲鱼扫码，或点击下方按钮打开闲鱼
              </div>
              <ol className="how">
                <li>
                  拍下商品，<b>拍下数量 = {o.quantity}</b>
                </li>
                <li>
                  应付金额 <b>{yuan(o.totalCents)}</b>（单价 {yuan(unitTotal)} × {o.quantity}）
                </li>
                <li>
                  在闲鱼<b>留言中粘贴订单号</b>并付款
                </li>
              </ol>
              {urlOk ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                  <a
                    className="btn btn-primary"
                    href={o.xianyuUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开闲鱼付款 ↗
                  </a>
                  <button
                    className="btn btn-line"
                    onClick={() => copy(o.xianyuUrl!, '闲鱼链接已复制')}
                  >
                    复制链接
                  </button>
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 18, fontSize: 14 }}>
                  客服暂未配置该租期的闲鱼商品链接，请
                  <SupportLink />
                  获取。
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="panel">
          <h3>
            <span className="n">3</span>付完回来，填写闲鱼订单号
          </h3>
          <XianyuForm o={o} onDone={() => void reload()} />
        </div>
      </>
    );
  } else if (st === 'verifying') {
    main = (
      <>
        <div className="alert info">
          <span>i</span>
          <div>
            <b>客服正在核对你的付款</b>。我们会在闲鱼后台确认金额和数量，通常 24
            小时内完成，确认后你会收到通知。
          </div>
        </div>
        <div className="panel">
          <h3>你提交的付款信息</h3>
          <dl className="kv">
            <dt>闲鱼订单号</dt>
            <dd className="mono">{o.xianyuOrderNo}</dd>
            <dt>闲鱼昵称</dt>
            <dd>{o.xianyuBuyerNick || '—'}</dd>
          </dl>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 16 }}>
            填错了？
            <SupportLink />
            修改。
          </p>
        </div>
      </>
    );
  } else if (st === 'queued') {
    const dl = o.deadlineAt ? new Date(o.deadlineAt).getTime() - now : 0;
    const d = Math.max(0, Math.floor(dl / DAY));
    const h = Math.max(0, Math.floor((dl % DAY) / HOUR));
    main = (
      <>
        <div className="alert ok">
          <span>✓</span>
          <div>
            <b>已确认收款，正在排队开通</b>。机器开通后，租期才开始计算。
          </div>
        </div>
        <div className="panel">
          <h3>开通时限</h3>
          <p className="muted" style={{ fontSize: 14.5, marginBottom: 16 }}>
            自确认收款起 7 天内完成开通，通常会更快。
          </p>
          <div className="countdown">
            <div>
              <b>{d}</b>
              <span>天</span>
            </div>
            <div>
              <b>{h}</b>
              <span>小时</span>
            </div>
          </div>
          {o.deadlineAt && (
            <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
              截止 {fmtTime(o.deadlineAt)}
              {dl < 0 ? '（已超期，我们会优先处理）' : ''} · 超期未开通可选择全额退款或每超 1 天补 1
              天租期（
              <Link className="link" href="/refund">
                退款政策
              </Link>
              ）
            </p>
          )}
        </div>
        <div className="panel">
          <h3>等待期间可以做什么</h3>
          <ol className="how">
            <li>
              阅读{' '}
              <Link className="link" href="/help">
                UU 远程连接教程
              </Link>
              ，提前在电脑和手机上装好 UU 远程
            </li>
            <li>确认联系方式正确，开通后我们会第一时间通知你</li>
          </ol>
        </div>
      </>
    );
  } else if (st === 'renewed') {
    main = (
      <>
        <div className="alert ok">
          <span>✓</span>
          <div>
            <b>已续费，到期时间已延长</b>。到「我的设备」查看最新到期时间。
          </div>
        </div>
        <div className="panel" style={{ textAlign: 'center', padding: 44 }}>
          <div className="dev-ic" style={{ margin: '0 auto 18px' }}>
            <i></i>
          </div>
          <h3 style={{ justifyContent: 'center' }}>续费成功</h3>
          <Link
            className="btn btn-primary btn-lg"
            href="/account/devices"
            style={{ marginTop: 14 }}
          >
            查看我的设备
          </Link>
        </div>
      </>
    );
  } else if (st === 'active' || st === 'done') {
    main = (
      <>
        <div className="alert ok">
          <span>✓</span>
          <div>
            <b>机器已开通</b>。到「我的设备」查看 UU
            远程连接信息，确认能正常连接后请在闲鱼确认收货。
          </div>
        </div>
        <div className="panel" style={{ textAlign: 'center', padding: 44 }}>
          <div className="dev-ic" style={{ margin: '0 auto 18px' }}>
            <i></i>
          </div>
          <h3 style={{ justifyContent: 'center' }}>{o.quantity} 台 Mac mini 已就绪</h3>
          <Link
            className="btn btn-primary btn-lg"
            href="/account/devices"
            style={{ marginTop: 14 }}
          >
            查看连接信息
          </Link>
        </div>
      </>
    );
  } else {
    main = (
      <div className="alert danger">
        <span>!</span>
        <div>
          <b>{ORDER_STATUS_LABEL[st]}</b>。
          {st === 'refunding' ? '退款正在处理，到账以闲鱼退款流程为准。' : '该订单已结束。'}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <Link className="link" style={{ fontSize: 14 }} href="/account/orders">
        ← 我的订单
      </Link>
      <h1 className="page-title" style={{ marginTop: 14 }}>
        {st === 'pending' || st === 'failed' ? (renew ? '续费付款' : '去闲鱼付款') : '订单详情'}
      </h1>
      <OrderFlow step={STEP[st]} />
      <div className="two">
        <div>{main}</div>
        <div>
          <div className="panel">
            <h3>
              订单信息{' '}
              <span style={{ marginLeft: 'auto' }}>
                <span className={`pill ${PILL[st]}`}>{ORDER_STATUS_LABEL[st]}</span>
              </span>
            </h3>
            <dl className="kv">
              <dt>订单号</dt>
              <dd className="mono">{o.no}</dd>
              <dt>类型</dt>
              <dd>{renew ? '续费订单' : '新租订单'}</dd>
              <dt>套餐</dt>
              <dd>
                Mac mini M4 · {plan.name} · {o.quantity} 台
              </dd>
              <dt>金额</dt>
              <dd>
                <b style={{ fontSize: 18 }}>{yuan(o.totalCents)}</b>
              </dd>
              <dt>联系方式</dt>
              <dd>
                {[
                  o.contactWechat && `微信 ${o.contactWechat}`,
                  o.contactTelegram && `Telegram ${o.contactTelegram}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
              <dt>创建时间</dt>
              <dd>{fmtTime(o.createdAt)}</dd>
              {o.xianyuOrderNo && (
                <>
                  <dt>闲鱼订单号</dt>
                  <dd className="mono">{o.xianyuOrderNo}</dd>
                </>
              )}
            </dl>
          </div>
          <div className="panel">
            <h3>订单进度</h3>
            <Timeline o={o} />
            {st === 'pending' && (
              <button
                className="btn btn-line btn-sm"
                style={{ marginTop: 6 }}
                onClick={() => setCancelOpen(true)}
              >
                取消订单
              </button>
            )}
          </div>
        </div>
      </div>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <h3>取消订单？</h3>
        <p className="muted" style={{ fontSize: 14.5, margin: '6px 0 24px' }}>
          取消后订单作废。如果你已经在闲鱼付款，请不要取消，先联系客服处理。
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-line btn-block" onClick={() => setCancelOpen(false)}>
            再想想
          </button>
          <button className="btn btn-danger btn-block" onClick={doCancel}>
            确认取消
          </button>
        </div>
      </Modal>
    </div>
  );
}
