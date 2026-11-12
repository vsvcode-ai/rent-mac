'use client';
import { createContext, useContext } from 'react';
import type { AdminMe, AdminRole } from '@/lib/admin-types';

export interface AdminCtxValue {
  admin: AdminMe;
  /** 管理员角色拥有全部权限 */
  can: (...roles: AdminRole[]) => boolean;
  reloadCounts: () => void;
}
export const AdminCtx = createContext<AdminCtxValue | null>(null);
export const useAdmin = () => {
  const v = useContext(AdminCtx);
  if (!v) throw new Error('useAdmin 必须在后台布局内使用');
  return v;
};
