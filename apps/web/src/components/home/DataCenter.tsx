'use client';
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { observeReveal } from '@/lib/anim';
import { usePlans } from './PlansContext';

export function DataCenter() {
  const plans = usePlans();
  const ref = useRef<HTMLDivElement>(null);
  const total = plans?.total ?? 200;
  const idle = plans?.available ?? 0;
  const loaded = plans !== undefined;

  // 数据到达后，点阵和数字才会被重新渲染，需要再登记一次滚动入场
  useEffect(() => {
    if (!loaded) return;
    const root = ref.current;
    if (!root) return;
    const id = requestAnimationFrame(() => observeReveal(root));
    return () => cancelAnimationFrame(id);
  }, [loaded, idle, total]);

  const cells = useMemo(() => {
    const arr: string[] = [];
    const mk = (n: number, c: string) => {
      for (let i = 0; i < n; i++) arr.push(c);
    };
    mk(62, 'u');
    mk(13, 'r');
    mk(4, 'm');
    mk(Math.max(0, 200 - arr.length - idle), 'u');
    mk(idle, 'free');
    return arr.slice(0, 200);
  }, [idle]);

  return (
    <div className="dc" ref={ref}>
      <div className="rv">
        <h2>
          <span className="cl">{total} 台 Mac mini，</span>
          <br />
          <span className="cl" style={{ color: 'var(--ink-dim)' }}>
            同一个机房，
          </span>
          <span className="cl" style={{ color: 'var(--ink-dim)' }}>
            统一运维。
          </span>
        </h2>
        <p>统一采购、统一配置、7×24 在线监控。你租到的每一台，都是有独立编号的实体机。</p>
        <div className="dc-stats">
          <div>
            <b key={`t${total}`} data-count={total}>
              0
            </b>
            <span>机器总数</span>
          </div>
          <div>
            <b key={`i${loaded ? idle : 'x'}`} data-count={idle}>
              0
            </b>
            <span>当前可租</span>
          </div>
          <div>
            <b>
              ≤ 7<small style={{ fontSize: '.4em', letterSpacing: 0, marginLeft: 4 }}>天</small>
            </b>
            <span>开通时限</span>
          </div>
        </div>
        {plans && (
          <p className="status" style={{ marginTop: 22 }} role="status">
            {plans.allOnline === false
              ? '部分机器暂时离线，运维正在处理，已租用的用户会收到通知'
              : '所有机器运行正常'}
          </p>
        )}
      </div>
      <div className="rv" style={{ '--d': '.1s' } as CSSProperties}>
        <div className="dc-head">
          <span>机柜状态 · R01–R10</span>
          <span className="mono">实时</span>
        </div>
        <div className="dotgrid anim" key={`g${idle}`}>
          {cells.map((c, i) => (
            <i
              key={i}
              className={c}
              style={{ '--i': i } as CSSProperties}
              title={`NYD-MY-${String(i + 1).padStart(4, '0')}`}
            />
          ))}
        </div>
        <div className="legend">
          <span>
            <i
              style={{
                background: 'radial-gradient(circle,var(--sig) 0 2px,transparent 2.5px)',
                boxShadow: 'inset 0 0 0 1px var(--hl3)',
              }}
            ></i>
            可租
          </span>
          <span>
            <i style={{ background: '#55544e' }}></i>使用中
          </span>
          <span>
            <i style={{ background: 'var(--hl2)' }}></i>回收中
          </span>
          <span>
            <i style={{ background: '#5c4524' }}></i>维护中
          </span>
        </div>
      </div>
    </div>
  );
}
