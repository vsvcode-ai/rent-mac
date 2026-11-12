export const ORDER_STATUSES = [
  'pending', // 待付款
  'verifying', // 待核对
  'failed', // 核对失败
  'queued', // 待开通
  'active', // 使用中
  'done', // 已完成
  'cancelled', // 已取消
  'refunding', // 退款中
  'refunded', // 已退款
  'renewed', // 已续费（续费单终态）
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待付款',
  verifying: '待核对',
  failed: '核对失败',
  queued: '待开通',
  active: '使用中',
  done: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款',
  renewed: '已续费',
};

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['verifying', 'cancelled'],
  verifying: ['queued', 'renewed', 'failed', 'cancelled'],
  // 核对失败后用户可重新提交闲鱼单号
  failed: ['verifying', 'cancelled'],
  queued: ['active', 'refunding'],
  active: ['done', 'refunding'],
  done: [],
  cancelled: [],
  refunding: ['refunded', 'queued', 'active'],
  refunded: [],
  renewed: [],
};

export const DEVICE_STATUSES = [
  'idle', // 空闲
  'assigned', // 已分配
  'in_use', // 使用中
  'expiring', // 即将到期（≤7 天）
  'grace', // 宽限期
  'recycling', // 回收中
  'maintenance', // 维护中
  'fault', // 故障
  'retired', // 下架
] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  idle: '空闲',
  assigned: '已分配',
  in_use: '使用中',
  expiring: '即将到期',
  grace: '宽限期',
  recycling: '回收中',
  maintenance: '维护中',
  fault: '故障',
  retired: '下架',
};

export const DEVICE_TRANSITIONS: Record<DeviceStatus, readonly DeviceStatus[]> = {
  idle: ['assigned', 'maintenance', 'fault', 'retired'],
  assigned: ['in_use', 'idle', 'fault'],
  in_use: ['expiring', 'fault', 'maintenance', 'recycling'],
  // 续费后回到使用中
  expiring: ['in_use', 'grace', 'fault'],
  grace: ['in_use', 'recycling'],
  recycling: ['idle', 'fault'],
  maintenance: ['idle', 'in_use', 'retired'],
  fault: ['idle', 'in_use', 'maintenance', 'retired'],
  retired: [],
};

export class InvalidTransitionError extends Error {
  constructor(kind: string, from: string, to: string) {
    super(`${kind}状态不能从「${from}」变为「${to}」`);
    this.name = 'InvalidTransitionError';
  }
}

export const canOrderTransition = (from: OrderStatus, to: OrderStatus) =>
  ORDER_TRANSITIONS[from].includes(to);
export const canDeviceTransition = (from: DeviceStatus, to: DeviceStatus) =>
  DEVICE_TRANSITIONS[from].includes(to);

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canOrderTransition(from, to)) throw new InvalidTransitionError('订单', from, to);
}
export function assertDeviceTransition(from: DeviceStatus, to: DeviceStatus): void {
  if (!canDeviceTransition(from, to)) throw new InvalidTransitionError('机器', from, to);
}

/** 订单进入该状态时占用库存（待开通） */
export const OCCUPIES_STOCK: readonly OrderStatus[] = ['queued'];

/** 剩余可租 = 空闲机器数 − 待开通订单的台数合计 */
export const availableStock = (idleDevices: number, queuedQuantity: number) =>
  Math.max(0, idleDevices - queuedQuantity);
