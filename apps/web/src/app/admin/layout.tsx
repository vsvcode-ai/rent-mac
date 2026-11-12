import type { Metadata } from 'next';
import '@/styles/admin.css';
import { BodyClass } from '@/components/admin/BodyClass';

export const metadata: Metadata = { title: '管理后台 · 南洋桌面', robots: { index: false } };

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BodyClass name="adm" />
      {children}
    </>
  );
}
