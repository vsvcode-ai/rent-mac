'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { calcPrice, DEFAULT_PLANS, type PlanDef } from '@nyd/shared';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { loadSel, type PlanSel } from '@/lib/flow';
import { yuan } from '@/lib/format';
import { useApi, useRequireLogin } from '@/lib/hooks';
import type { OrderView, PlansResponse } from '@/lib/types';
import { OrderFlow } from '../OrderFlow';

export default function NewOrderPage() {
  const { me } = useRequireLogin();
  const router = useRouter();
  const toast = useToast();
  const { data } = useApi<PlansResponse>('/plans');
  const [sel, setSel] = useState<PlanSel | null>(null);
  const [wechat, setWechat] = useState('');
  const [telegram, setTelegram] = useState('');
  const [agree, setAgree] = useState(false);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => setSel(loadSel()), []);
  useEffect(() => {
    if (me) {
      setWechat((v) => v || me.wechat || '');
      setTelegram((v) => v || me.telegram || '');
    }
  }, [me]);

  const plans: PlanDef[] = useMemo(
    () =>
      DEFAULT_PLANS.map((p) => {
        const live = data?.plans.find((x) => x.term === p.term);
        return live
          ? { ...p, monthlyCents: live.monthlyCents, dedicatedSupport: live.dedicatedSupport }
          : p;
      }),
    [data],
  );

  if (!me || !sel)
    return (
      <div className="wrap page">
        <p className="muted">加载中…</p>
      </div>
    );

  const plan = plans.find((p) => p.term === sel.plan)!;
  const price = calcPrice(sel.plan, sel.qty, plans);

  const submit = async () => {
    const w = wechat.trim();
    const t = telegram.trim();
    setBad(!w && !t);
    setErr('');
    if (!w && !t) return document.getElementById('wechat')?.focus();
    if (!agree) return toast('请先勾选同意相关条款');
    setBusy(true);
    try {
      const o = await api<OrderView>('/orders', {
        body: {
          term: sel.plan,
          quantity: sel.qty,
          contactWechat: w || undefined,
          contactTelegram: t || undefined,
          agreedTerms: true,
        },
      });
      router.push(`/order/${o.no}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="wrap page">
      <h1 className="page-title">确认订单</h1>
      <p className="muted">核对套餐，留下联系方式，提交后到闲鱼付款。</p>
      <OrderFlow step={0} />

      <div className="two">
        <div>
          <div className="panel">
            <h3>
              <span className="n">1</span>你的套餐
            </h3>
            <div className="prod" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <div className="dev-ic" style={{ width: 72, height: 72 }}>
                <i></i>
              </div>
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 18 }}>Mac mini M4 · 马来西亚机房</b>
                <div className="muted" style={{ fontSize: 14 }}>
                  16GB 内存 · 256GB 存储 · 独立 IP 宽带（已包含）
                </div>
              </div>
              <Link className="link" style={{ fontSize: 14 }} href="/#pricing">
                修改
              </Link>
            </div>
            <dl
              className="kv"
              style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--line)' }}
            >
              <dt>租期</dt>
              <dd>
                {plan.name} · {plan.months} 个月
              </dd>
              <dt>台数</dt>
              <dd>{sel.qty} 台</dd>
              <dt>计费方式</dt>
              <dd>
                {yuan(plan.monthlyCents)} / 月 × {plan.months} 个月 × {sel.qty} 台
              </dd>
              <dt>起租时间</dt>
              <dd>
                从<b>开通当天</b>开始计算，不从付款日算
              </dd>
            </dl>
          </div>

          <div className="panel">
            <h3>
              <span className="n">2</span>联系方式
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: '-6px 0 18px' }}>
              开通后我们会通过站内信、邮件和下面的联系方式通知你。微信和 Telegram 至少填一个。
            </p>
            <div className="row2">
              <div className="field">
                <label htmlFor="wechat">微信号</label>
                <input
                  id="wechat"
                  className={`input${bad ? ' err' : ''}`}
                  placeholder="例如 nanyang_user"
                  maxLength={64}
                  value={wechat}
                  onChange={(e) => setWechat(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="telegram">Telegram</label>
                <input
                  id="telegram"
                  className="input"
                  placeholder="@username"
                  maxLength={64}
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                />
              </div>
            </div>
            <div className={`field${bad ? ' bad' : ''}`} style={{ margin: 0 }}>
              <div className="errmsg">请至少填写一个联系方式</div>
            </div>
            <label className="check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                我已阅读并同意
                <Link className="link" href="/terms" target="_blank">
                  服务条款
                </Link>
                、
                <Link className="link" href="/refund" target="_blank">
                  退款政策
                </Link>
                和
                <Link className="link" href="/aup" target="_blank">
                  可接受使用政策
                </Link>
              </span>
            </label>
          </div>
        </div>

        <aside className="summary" style={{ top: 84 }}>
          <h3>订单金额</h3>
          <div className="sub">
            {plan.name} · {sel.qty} 台
          </div>
          <div className="line-item">
            <span>机器</span>
            <b>
              {yuan(plan.monthlyCents)} × {plan.months} × {sel.qty}
            </b>
          </div>
          <div className="line-item">
            <span>宽带</span>
            <b className="inc">已包含</b>
          </div>
          <div className="line-item">
            <span>付款方式</span>
            <b>闲鱼担保交易</b>
          </div>
          <div className="total">
            <span>应付总额</span>
            <strong>
              <small>¥</small>
              {(price.totalCents / 100).toLocaleString('zh-CN')}
            </strong>
          </div>
          <div className="saved">
            {price.savedCents > 0 ? `比月付共省 ${yuan(price.savedCents)}` : ''}
          </div>
          <div className={`perk${plan.dedicatedSupport ? '' : ' off'}`}>
            {plan.dedicatedSupport ? '★ 含 1 对 1 专属客服' : '半年付、年付可享 1 对 1 专属客服'}
          </div>
          {err && (
            <div className="alert danger" role="alert" style={{ marginBottom: 12 }}>
              <span>!</span>
              <div>{err}</div>
            </div>
          )}
          <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={busy}>
            {busy ? '订单创建中…' : '提交订单，去闲鱼付款'}
          </button>
          <p className="fine">提交后订单保留 48 小时，超时未付款将自动取消</p>
        </aside>
      </div>
    </div>
  );
}
