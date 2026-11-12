'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prefersReducedMotion } from '@/lib/anim';
import { usePlans } from './PlansContext';

const d = (v: string) => ({ '--d': v }) as CSSProperties;
const SPARK = [30, 42, 38, 65, 80, 72, 55, 48, 61, 90, 76, 44];

function klTime() {
  const t = new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

export function Hero() {
  const plans = usePlans();
  const [go, setGo] = useState(false);
  const [time, setTime] = useState('14:20');
  const tty = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGo(true));
    setTime(klTime());
    const lines = [...(tty.current?.querySelectorAll('.ln') ?? [])];
    if (prefersReducedMotion()) lines.forEach((l) => l.classList.add('on'));
    const timers = lines.map((l, i) => setTimeout(() => l.classList.add('on'), 1100 + i * 380));
    return () => {
      cancelAnimationFrame(id);
      timers.forEach(clearTimeout);
    };
  }, []);

  const idle = plans?.available;
  const stock = idle === undefined ? '现货充足' : `现货 ${idle} 台`;
  const ticker = [
    <b key="a">Mac mini M4</b>,
    '16GB 统一内存',
    '256GB 存储',
    <b key="b">独立固定 IP</b>,
    'UU 远程 · Mac / Windows / 手机',
    <b key="c">{stock}</b>,
    '马来西亚机房 · 7×24 监控',
    <b key="d">年付 ¥499 / 月</b>,
    '闲鱼担保交易',
    '7 天内开通',
  ];
  const one = ticker.map((t, i) => <span key={i}>{t}</span>);

  return (
    <section className={`hero${go ? ' go' : ''}`} id="top">
      <div className="wrap">
        <a className="eyebrow" href="#dc">
          <i></i>
          <b>马来西亚机房</b>
          <span className="sep"></span>
          <span>{stock}</span>
          <span style={{ color: 'var(--ink3)' }}>→</span>
        </a>
        <h1>
          <span className="ln">
            <span style={d('.05s')}>
              <span className="cl">一台独享的</span> <span className="cl">Mac mini，</span>
            </span>
          </span>
          <span className="ln">
            <span style={d('.18s')} className="o">
              <span className="cl">放在南洋，</span>
              <span className="cl">连到你手边。</span>
            </span>
          </span>
        </h1>
        <div className="hero-row">
          <div className="rv" style={d('.35s')}>
            <p className="lead">
              实体机独享，配<b>独立固定 IP</b>。用 UU
              远程从电脑或手机连接，租期内环境一直在。年付每月 <b>¥499</b> 起。
            </p>
            <div className="hero-meta">
              <span>闲鱼担保交易</span>
              <span>付款后 7 天内开通</span>
              <span>宽带已包含</span>
            </div>
          </div>
          <div className="hero-cta rv" style={d('.45s')}>
            <a className="btn btn-primary btn-lg" href="#pricing">
              选择套餐 <span className="arr">→</span>
            </a>
            <Link className="btn btn-ghost btn-lg" href="/help">
              查看连接方式
            </Link>
          </div>
        </div>

        <div className="shotpanel rv" style={d('.55s')} aria-hidden="true">
          <div className="app">
            <div className="app-bar">
              <span className="dots">
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span className="t">
                UU 远程 ·{' '}
                <b className="mono" style={{ color: 'var(--ink-m)' }}>
                  NYD-MY-0042
                </b>
              </span>
              <span className="live">已连接</span>
              <span className="sp"></span>
              <span className="mono">延迟 38ms · 1920×1080</span>
            </div>
            <div className="desk">
              <div className="menubar">
                <b>Terminal</b>
                <span>Shell</span>
                <span>Edit</span>
                <span>View</span>
                <span className="r">Kuala Lumpur {time}</span>
              </div>
              <div className="tty">
                <div className="tb">nydesk@mini-0042 — ~/projects/shop-app</div>
                <div className="tbody" ref={tty}>
                  <span className="ln">
                    <span className="p">~/projects/shop-app $</span>{' '}
                    <span className="w">claude</span>
                  </span>
                  <span className="ln">
                    <span className="c">●</span> 重构 <span className="w">PaymentService</span>
                    ，并补齐单元测试
                  </span>
                  <span className="ln">
                    <span className="p"> ├ 读取 14 个文件</span>
                  </span>
                  <span className="ln">
                    <span className="p"> ├ 修改 src/payment/service.ts</span>
                  </span>
                  <span className="ln">
                    <span className="p"> └ 运行测试</span> <span className="ok">48 passed</span>
                  </span>
                  <span className="ln">
                    <span className="c">●</span> 已运行 <span className="w">2 小时 14 分</span> ·
                    合上笔记本也不会中断
                  </span>
                  <span className="ln">
                    <span className="p">~/projects/shop-app $</span>{' '}
                    <span className="cursor"></span>
                  </span>
                </div>
              </div>
            </div>
            <aside className="app-info">
              <div>
                <h6>设备</h6>
                <div className="row">
                  <span>型号</span>
                  <b>Mac mini M4</b>
                </div>
                <div className="row">
                  <span>内存 / 存储</span>
                  <b>16GB · 256GB</b>
                </div>
                <div className="row">
                  <span>固定 IP</span>
                  <span className="mono">103.17.46.49</span>
                </div>
                <div className="row">
                  <span>机房</span>
                  <b>马来西亚</b>
                </div>
              </div>
              <div>
                <h6>租期</h6>
                <div className="row">
                  <span>到期</span>
                  <b>2027-10-05</b>
                </div>
                <div className="meter">
                  <i style={{ width: '89%' }}></i>
                </div>
                <div className="row" style={{ paddingTop: 8 }}>
                  <span>剩余</span>
                  <b>327 天</b>
                </div>
              </div>
              <div>
                <h6>CPU · 近 1 小时</h6>
                <div className="spark">
                  {SPARK.map((h, i) => (
                    <i
                      key={i}
                      className={h > 60 ? 'on' : ''}
                      style={{ height: `${h}%`, '--i': i } as CSSProperties}
                    />
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
      <div className="ticker" aria-hidden="true">
        <div className="tk">
          {one}
          {one}
        </div>
      </div>
    </section>
  );
}
