import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/AccountShell';

export const metadata: Metadata = { title: '我的账户 · 南洋桌面' };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
