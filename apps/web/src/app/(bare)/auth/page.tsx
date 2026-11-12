import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from './AuthForm';

export const metadata: Metadata = { title: '登录 · 南洋桌面' };

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
