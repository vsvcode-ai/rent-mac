import type { Metadata, Viewport } from 'next';
import '@/styles/site.css';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: '南洋桌面 · 马来西亚 Mac mini 租赁',
  description: '马来西亚机房自营的 Mac mini 租赁。独享实体机，独立固定 IP，用 UU 远程随时连接。',
};
export const viewport: Viewport = { themeColor: '#0b0b0a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
