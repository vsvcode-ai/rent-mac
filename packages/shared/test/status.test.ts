import { describe, expect, it } from 'vitest';
import {
  availableStock,
  assertDeviceTransition,
  assertOrderTransition,
  canDeviceTransition,
  canOrderTransition,
  DEVICE_STATUSES,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  DEVICE_TRANSITIONS,
  InvalidTransitionError,
} from '../src';

describe('订单状态机', () => {
  it('主链路：待付款 → 待核对 → 待开通 → 使用中 → 已完成', () => {
    const path = ['pending', 'verifying', 'queued', 'active', 'done'] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(canOrderTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it('续费单：待核对 → 已续费', () =>
    expect(canOrderTransition('verifying', 'renewed')).toBe(true));
  it('不能跳过核对直接开通', () => {
    expect(canOrderTransition('pending', 'queued')).toBe(false);
    expect(() => assertOrderTransition('pending', 'active')).toThrow(InvalidTransitionError);
  });
  it('终态不能再流转', () => {
    for (const s of ['done', 'cancelled', 'refunded', 'renewed'] as const)
      for (const t of ORDER_STATUSES) expect(canOrderTransition(s, t)).toBe(false);
  });
  it('所有目标状态都是已知状态', () => {
    for (const to of Object.values(ORDER_TRANSITIONS).flat()) expect(ORDER_STATUSES).toContain(to);
  });
  it('自己不能流转到自己', () => {
    for (const s of ORDER_STATUSES) expect(canOrderTransition(s, s)).toBe(false);
  });
});

describe('机器状态机', () => {
  it('回收闭环：使用中 → 即将到期 → 宽限期 → 回收中 → 空闲', () => {
    const path = ['in_use', 'expiring', 'grace', 'recycling', 'idle'] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(canDeviceTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it('续费可从即将到期、宽限期回到使用中', () => {
    expect(canDeviceTransition('expiring', 'in_use')).toBe(true);
    expect(canDeviceTransition('grace', 'in_use')).toBe(true);
  });
  it('回收中必须经清单后才回空闲，不能直接分配', () => {
    expect(() => assertDeviceTransition('recycling', 'assigned')).toThrow();
  });
  it('下架是终态', () => {
    for (const t of DEVICE_STATUSES) expect(canDeviceTransition('retired', t)).toBe(false);
  });
  it('目标状态都已知', () => {
    for (const to of Object.values(DEVICE_TRANSITIONS).flat())
      expect(DEVICE_STATUSES).toContain(to);
  });
});

describe('库存', () => {
  it('剩余可租 = 空闲 − 待开通台数，不为负', () => {
    expect(availableStock(121, 5)).toBe(116);
    expect(availableStock(3, 5)).toBe(0);
  });
});
