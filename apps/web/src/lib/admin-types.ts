import type { DeviceStatus, OrderStatus, Term } from '@nyd/shared';

export type AdminRole = 'support' | 'ops' | 'admin';
export interface AdminMe {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  totpEnabled: boolean;
}

export interface Dashboard {
  pendingVerify: number;
  verifyOverdue: number;
  queued: number;
  queuedWarn: number;
  queuedOverdue: number;
  leased: number;
  idle: number;
  expiring7: number;
  monthRevenueCents: number;
  ordersLast14d: { date: string; count: number }[];
  utilization: {
    total: number;
    leased: number;
    idle: number;
    maintenance: number;
    fault: number;
    recycling: number;
  };
  todos: { type: string; text: string; href: string }[];
}

export interface AdminOrder {
  id: string;
  no: string;
  kind: 'new' | 'renew';
  term: Term;
  months: number;
  quantity: number;
  unitCents: number;
  totalCents: number;
  paidCents: number | null;
  contactWechat: string | null;
  contactTelegram: string | null;
  xianyuOrderNo: string | null;
  xianyuBuyerNick: string | null;
  xianyuSubmittedAt: string | null;
  status: OrderStatus;
  failedReason: string | null;
  cancelledReason: string | null;
  paidAt: string | null;
  deadlineAt: string | null;
  createdAt: string;
  userEmail?: string;
  verifyOverdue?: boolean;
  remainingMs?: number;
  deadlineLevel?: 'ok' | 'warn' | 'overdue';
  renewLeaseId?: string | null;
}
export interface AdminOrderDetail extends AdminOrder {
  devices: { leaseId: string; code: string; publicIp: string; startAt: string; endAt: string }[];
}
export interface Paged<T> {
  total: number;
  items: T[];
}

export interface DeviceRow {
  id: string;
  code: string;
  serial: string;
  rackLocation: string;
  publicIp: string;
  status: DeviceStatus;
  note: string | null;
  lessee: string | null;
  leaseId: string | null;
  endAt: string | null;
  online?: boolean | null;
}
export interface DevicesResponse extends Paged<DeviceRow> {
  summary: Record<string, number>;
}
export interface IdleDevice {
  id: string;
  code: string;
  publicIp: string;
  rackLocation: string;
}
export interface ImportResult {
  imported: number;
  valid: number;
  errors: { row: number; message: string }[];
}

export interface RecycleItem {
  deviceId: string;
  code: string;
  publicIp: string;
  lessee: string | null;
  endedAt: string | null;
  daysWaiting: number;
}

export interface TicketNote {
  id: string;
  adminName: string;
  content: string;
  internal: boolean;
  createdAt: string;
}
export interface AdminTicket {
  no: string;
  category: string;
  content: string;
  status: 'open' | 'processing' | 'resolved' | 'closed';
  userEmail: string;
  deviceCode: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  notes: TicketNote[];
}
export interface Staff {
  id: string;
  name: string;
  role: AdminRole;
}

export interface AdminUserRow {
  id: string;
  email: string;
  wechat: string | null;
  telegram: string | null;
  status: string;
  createdAt: string;
  orderCount: number;
  activeDevices: number;
}
export interface AdminUserDetail extends AdminUserRow {
  orders: AdminOrder[];
  leases: {
    id: string;
    deviceCode: string;
    publicIp: string;
    startAt: string;
    endAt: string;
    status: string;
  }[];
}

export interface RefundRow {
  id: string;
  orderNo: string;
  userEmail: string;
  amountCents: number;
  reason: string;
  status: 'refunding' | 'refunded';
  xianyuRefundNo: string | null;
  createdAt: string;
}
export interface RefundPreview {
  paidCents: number;
  suggestedCents: number;
  reason: string;
  daysUsed: number;
  usedMonths: number;
  activated: boolean;
}

export interface ConsultRow {
  id: string;
  contact: string;
  quantity: number | null;
  message: string;
  status: 'new' | 'following' | 'done';
  note: string | null;
  createdAt: string;
}

export interface SettingsResponse {
  settings: Record<string, string | number>;
  plans: {
    term: Term;
    months: number;
    monthlyCents: number;
    xianyuUrl: string | null;
    xianyuQrImage: string | null;
    dedicatedSupport: boolean;
  }[];
}
export interface AdminListItem {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  totpEnabled: boolean;
  status: string;
}
export interface AuditItem {
  id: string;
  action: string;
  target: string;
  detail: unknown;
  ip: string | null;
  createdAt: string;
  adminName: string;
  adminRole: AdminRole | null;
}
