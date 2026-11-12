'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { calcPrice, DEFAULT_PLANS, MAX_QTY_PER_ORDER, type PlanDef, type Term } from '@nyd/shared';
import { AnimatedNumber } from '@/lib/anim';
import { loadSel, saveSel, type PlanSel } from '@/lib/flow';
import { yuan } from '@/lib/format';
import { useMe } from '@/lib/hooks';
import { SupportLink } from '@/lib/support';
import { usePlans } from './PlansContext';

export function Pricing() {
  const data = usePlans();
  const { me } = useMe();
  const router = useRouter();
  const [sel, setSel] = useState<PlanSel>({ plan: 'm12', qty: 1 });
  const [ready, setReady] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    setSel(loadSel());
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) saveSel(sel);
  }, [sel, ready]);

  // 价格以接口为准；接口未返回前用共享包里的默认价，避免页面闪烁
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
  const plan = plans.find((p) => p.term === sel.plan)!;
  const price = calcPrice(sel.plan, sel.qty, plans);
  const base = plans.find((p) => p.term === 'm1')!.monthlyCents;
  const out = data ? data.available === 0 : false;

  const choose = (t: Term) => setSel((s) => ({ ...s, plan: t }));
  const qty = (n: number) => {
    setSel((s) => ({ ...s, qty: Math.min(MAX_QTY_PER_ORDER, Math.max(1, s.qty + n)) }));
    setBump((b) => b + 1);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const i = plans.findIndex((p) => p.term === sel.plan);
    const step = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? plans.length - 1 : 1;
    const next = plans[(i + step) % plans.length]!;
    choose(next.term);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-term="${next.term}"]`)?.focus(),
    );
  };
  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    saveSel(sel);
    router.push(me ? '/order/new' : `/auth?next=${encodeURIComponent('/order/new')}`);
  };

  return (
    <div className="pricing">
      <div className="rv">
        <div className="terms" role="radiogroup" aria-label="租期" onKeyDown={onKey}>
          {plans.map((p) => {
            const t = p.monthlyCents * p.months;
            const sv = (base - p.monthlyCents) * p.months;
            const on = sel.plan === p.term;
            return (
              <button
                key={p.term}
                data-term={p.term}
                className={`term${on ? ' on' : ''}`}
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(p.term)}
              >
                {p.term === 'm12' && <span className="badge">最划算</span>}
                <span className="radio"></span>
                <div className="n">
                  {p.name} · {p.months} 个月
                </div>
                <div className="p">
                  {yuan(p.monthlyCents)}
                  <small>/ 月</small>
                </div>
                <div className="s">{yuan(t)} / 台</div>
                {sv > 0 ? (
                  <span className="save">比月付省 {yuan(sv)}</span>
                ) : (
                  <span className="save mute">灵活，按月续</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="opt-row">
          <div>
            <b>租用台数</b>
            <small>
              单笔最多 {MAX_QTY_PER_ORDER} 台，更多请 <SupportLink />
            </small>
          </div>
          <div className="stepper">
            <button onClick={() => qty(-1)} disabled={sel.qty <= 1} aria-label="减少">
              −
            </button>
            <output key={bump} className={bump ? 'bump' : ''} aria-live="polite">
              {sel.qty}
            </output>
            <button
              onClick={() => qty(1)}
              disabled={sel.qty >= MAX_QTY_PER_ORDER}
              aria-label="增加"
            >
              +
            </button>
          </div>
        </div>
        <div className="opt-row">
          <div>
            <b>机型配置</b>
            <small>Mac mini M4 · 16GB 内存 · 256GB 存储</small>
          </div>
          <span className={`pill ${out ? '' : 'ok'}`}>{out ? '暂无现货' : '现货'}</span>
        </div>
        <div className="opt-row">
          <div>
            <b>独立 IP 宽带</b>
            <small>随机器租期使用，不额外收费</small>
          </div>
          <span className="pill">已包含</span>
        </div>
      </div>
      <aside className="summary rv" style={{ '--d': '.1s' } as CSSProperties}>
        <h3>账单</h3>
        <div className="sub">每一项选择，都在这里。</div>
        <div className="line-item">
          <span>机器</span>
          <b>
            {yuan(plan.monthlyCents)} × {plan.months} 个月 × {sel.qty} 台
          </b>
        </div>
        <div className="line-item">
          <span>宽带</span>
          <b className="inc">已包含</b>
        </div>
        <div className="line-item">
          <span>租期</span>
          <b>
            {plan.name} · {plan.months} 个月
          </b>
        </div>
        <div className="line-item">
          <span>付款方式</span>
          <b>闲鱼担保交易</b>
        </div>
        <div className="total">
          <span>总价</span>
          <strong>
            <small>¥</small>
            <AnimatedNumber value={price.totalCents / 100} />
          </strong>
        </div>
        <div className="saved">
          {price.savedCents > 0 ? `比月付共省 ${yuan(price.savedCents)}` : ''}
        </div>
        <div className={`perk${plan.dedicatedSupport ? '' : ' off'}`}>
          {plan.dedicatedSupport ? '含 1 对 1 专属客服' : '半年付、年付可享 1 对 1 专属客服'}
        </div>
        <a className="btn btn-primary btn-lg btn-block" href="/order/new" onClick={go}>
          立即租用 <span className="arr">→</span>
        </a>
        <p className="fine">下单后到闲鱼付款，客服核对后 7 天内开通</p>
      </aside>
    </div>
  );
}
