import { canDeviceTransition, type DeviceStatus } from '@nyd/shared';

/** 租期推进涉及的机器状态；故障 / 维护等人工状态不参与自动推进 */
const FLOW: DeviceStatus[] = ['in_use', 'expiring', 'grace', 'recycling'];

/** 在「使用中 → 即将到期 → 宽限期 → 回收中」这条线上找从 from 到 to 的合法路径（不含起点）。不在这条线上返回 null。 */
export function devicePath(from: DeviceStatus, to: DeviceStatus): DeviceStatus[] | null {
  if (!FLOW.includes(from) || !FLOW.includes(to)) return null;
  if (from === to) return [];
  const queue: DeviceStatus[][] = [[from]];
  const seen = new Set<DeviceStatus>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const cur = path[path.length - 1]!;
    for (const n of FLOW) {
      if (seen.has(n) || !canDeviceTransition(cur, n)) continue;
      if (n === to) return [...path.slice(1), n];
      seen.add(n);
      queue.push([...path, n]);
    }
  }
  return null;
}
