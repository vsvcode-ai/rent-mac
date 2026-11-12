import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '南洋桌面 NanyangDesk · 海外 Mac mini 租赁',
  description: '马来西亚机房自营的 Mac mini 租赁。独享实体机，独立固定 IP，用 UU 远程随时连接。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
