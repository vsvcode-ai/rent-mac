import { ORDER_STATUS_LABEL, type OrderStatus } from '@nyd/shared';
import type { TicketStatus } from '@/lib/account-types';

const ORDER_CLASS: Record<OrderStatus, string> = {
  pending: 'warn',
  verifying: 'info',
  failed: 'danger',
  queued: 'brand',
  active: 'ok',
  done: 'mute',
  cancelled: 'mute',
  refunding: 'warn',
  refunded: 'mute',
  renewed: 'ok',
};
export const OrderPill = ({ status }: { status: OrderStatus }) => (
  <span className={`pill ${ORDER_CLASS[status]}`}>{ORDER_STATUS_LABEL[status]}</span>
);

const TICKET: Record<TicketStatus, [string, string]> = {
  open: ['待处理', 'warn'],
  processing: ['处理中', 'info'],
  resolved: ['已解决', 'ok'],
  closed: ['已关闭', 'mute'],
};
export const TicketPill = ({ status }: { status: TicketStatus }) => (
  <span className={`pill ${TICKET[status][1]}`}>{TICKET[status][0]}</span>
);

/** 租约状态：以接口 status 为准，剩余天数兜底 */
export function leaseState(status: string, daysLeft: number): { t: string; c: string } {
  if (status === 'grace' || daysLeft <= 0) return { t: '宽限期', c: 'danger' };
  if (status === 'expiring' || daysLeft <= 7) return { t: '即将到期', c: 'warn' };
  return { t: '使用中', c: 'ok' };
}
