'use client';
import { createElement, useEffect, useRef } from 'react';

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Animated = HTMLElement & { _raf?: number | null };

/** 数字递增：从当前显示值过渡到目标值，新动画会取消旧动画 */
export function animateNumber(el: HTMLElement, to: number, dur = 500) {
  const e = el as Animated;
  if (e._raf) cancelAnimationFrame(e._raf);
  const from = Number(String(e.textContent).replace(/[^\d.-]/g, '')) || 0;
  if (from === to || prefersReducedMotion()) {
    e.textContent = to.toLocaleString('zh-CN');
    return;
  }
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur));
    const ease = 1 - Math.pow(1 - k, 3);
    e.textContent = Math.round(from + (to - from) * ease).toLocaleString('zh-CN');
    e._raf = k < 1 ? requestAnimationFrame(step) : null;
  };
  e._raf = requestAnimationFrame(step);
}

export function AnimatedNumber({ value, dur = 600 }: { value: number; dur?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) animateNumber(ref.current, value, dur);
  }, [value, dur]);
  return createElement('span', { ref }, '0');
}

/** 滚动入场：.rv 进入视口加 .in；[data-count] 数字递增；.dotgrid.anim 逐点出现。可重复调用。 */
export function observeReveal(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>('.rv,[data-count],.dotgrid.anim')].filter(
    (e) => !e.classList.contains('in'),
  );
  const finish = (t: HTMLElement) => {
    t.classList.add('in');
    if (t.dataset.count) {
      if (prefersReducedMotion()) t.textContent = Number(t.dataset.count).toLocaleString('zh-CN');
      else {
        t.textContent = '0';
        animateNumber(t, Number(t.dataset.count), 1400);
      }
    }
  };
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    els.forEach(finish);
    return () => {};
  }
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        finish(e.target as HTMLElement);
      }),
    { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
  );
  els.forEach((e) => io.observe(e));
  return () => io.disconnect();
}

/** 在页面挂载后启用滚动入场（放在页面任意位置） */
export function RevealInit() {
  useEffect(() => {
    let off = () => {};
    const id = requestAnimationFrame(() => {
      off = observeReveal();
    });
    return () => {
      cancelAnimationFrame(id);
      off();
    };
  }, []);
  return null;
}
