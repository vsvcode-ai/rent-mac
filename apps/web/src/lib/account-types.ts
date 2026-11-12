import type { LeaseView } from './types';

/** 续费契约在 /me/leases 里增加的字段（docs/M2-M3-API契约.md） */
export type AccountLease = LeaseView & { canRenew?: boolean };

export const TICKET_CATEGORIES = ['无法连接', '机器卡顿', '重置密码', '重启', '其他'] as const;
export type TicketStatus = 'open' | 'processing' | 'resolved' | 'closed';

export interface TicketView {
  no: string;
  category: string;
  content: string;
  status: TicketStatus;
  createdAt: string;
  leaseId: string | null;
  deviceCode: string | null;
  notes: { content: string; createdAt: string; fromStaff: boolean }[];
}
