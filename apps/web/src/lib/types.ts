import type { DeviceStatus, OrderStatus, Term } from '@nyd/shared';

export interface PlanItem {
  term: Term;
  months: number;
  monthlyCents: number;
  totalCents: number;
  dedicatedSupport: boolean;
  xianyuUrl: string | null;
  xianyuQrImage: string | null;
}
export interface PlansResponse {
  available: number;
  /** 没有离线的使用中机器 */
  allOnline?: boolean;
  total: number;
  plans: PlanItem[];
}
export interface Me {
  id: string;
  email: string;
  wechat: string | null;
  telegram: string | null;
  createdAt: string;
}
export interface OrderView {
  no: string;
  kind: 'new' | 'renew';
  term: Term;
  months: number;
  quantity: number;
  unitCents: number;
  totalCents: number;
  contactWechat: string | null;
  contactTelegram: string | null;
  xianyuOrderNo: string | null;
  xianyuBuyerNick: string | null;
  status: OrderStatus;
  failedReason: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  deadlineAt: string | null;
  createdAt: string;
  xianyuUrl: string | null;
  xianyuQrImage: string | null;
}
export interface LeaseView {
  id: string;
  deviceCode: string;
  publicIp: string;
  deviceStatus: DeviceStatus;
  orderNo: string;
  startAt: string;
  endAt: string;
  graceEndAt: string;
  status: 'active' | 'expiring' | 'grace' | 'ended';
  daysLeft: number;
}
export interface Credential {
  uuDeviceCode: string;
  uuPassword: string;
  macUsername: string;
  macPassword: string;
}
export interface NotificationItem {
  id: string;
  template: string;
  subject: string;
  text: string;
  readAt: string | null;
  createdAt: string;
}
export interface PublicSettings {
  supportWechat: string;
  supportTelegram: string;
  supportWechatQr: string;
}
