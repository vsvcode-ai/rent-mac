import type { AdminRole } from '@/lib/admin-types';

/** 后台路径 → 允许进入的角色（admin 永远允许）。没列出的路径所有角色都能看。侧边栏与看板待办共用。 */
export const ROUTE_ROLES: Record<string, AdminRole[]> = {
  '/admin/provision': ['ops'],
  '/admin/recycle': ['ops'],
  '/admin/tickets': ['support', 'ops'],
  '/admin/consults': ['support'],
  '/admin/refunds': ['admin'],
};

export function roleCanOpen(role: AdminRole, href: string): boolean {
  if (role === 'admin') return true;
  const path = href.split('?')[0] ?? href;
  const key = Object.keys(ROUTE_ROLES).find((k) => path === k || path.startsWith(k + '/'));
  return !key || ROUTE_ROLES[key]!.includes(role);
}
