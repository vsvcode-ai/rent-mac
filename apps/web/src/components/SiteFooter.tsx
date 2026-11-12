'use client';
import Link from 'next/link';
import { Brand } from './Brand';
import { useApi } from '@/lib/hooks';
import type { PlansResponse } from '@/lib/types';

export function SiteFooter() {
  const { data } = useApi<PlansResponse>('/plans');
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <Brand />
            <p>马来西亚机房自营的 Mac mini 租赁。独享实体机，独立固定 IP，用 UU 远程随时连接。</p>
            {data && <span className="status">所有机器运行正常 · {data.available} 台可租</span>}
          </div>
          <div>
            <h4>产品</h4>
            <Link href="/#pricing">套餐价格</Link>
            <Link href="/#why">专属设备</Link>
            <Link href="/#scenes">使用场景</Link>
          </div>
          <div>
            <h4>帮助</h4>
            <Link href="/help">连接教程</Link>
            <Link href="/help#faq">常见问题</Link>
            <Link href="/account#tickets">提交工单</Link>
          </div>
          <div>
            <h4>政策</h4>
            <Link href="/refund">退款政策</Link>
            <Link href="/terms">服务条款</Link>
            <Link href="/privacy">隐私政策</Link>
            <Link href="/aup">可接受使用政策</Link>
          </div>
        </div>
        <div className="legal">
          <span>© 2026 南洋桌面 NanyangDesk · 机房：马来西亚 · UTC+8</span>
          <span>
            南洋桌面为独立服务，与 Apple Inc. 无关联，也未获其认可。Mac、Mac mini、macOS 是 Apple
            Inc. 的商标。
          </span>
        </div>
        <div className="wordmark" aria-hidden="true">
          NANYANGDESK
        </div>
      </div>
    </footer>
  );
}
