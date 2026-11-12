import { Injectable, Logger } from '@nestjs/common';
import { DAY_MS, EXPIRY_REMIND_DAYS } from '@nyd/shared';
import type { LeaseStatus } from '@prisma/client';
import { Clock } from '../common/clock.js';
import { devicePath } from '../leases/device-flow.js';
import { NotifyService } from '../notify/notify.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const RANK: Record<LeaseStatus, number> = { active: 0, expiring: 1, grace: 2, ended: 3 };

/**
 * 租约与机器状态的定时推进 + 到期提醒。
 * 到期前 ≤7 天 expiring → 过 endAt grace → 过 graceEndAt ended（机器进入回收中）。
 * 全部由 tick() 驱动，时间取自可注入的 Clock，幂等：重复执行不会重复发提醒或重复推进。
 */
@Injectable()
export class LifecycleService {
  private log = new Logger('Lifecycle');
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private notify: NotifyService,
    private orders: OrdersService,
  ) {}

  async tick() {
    const cancelled = await this.orders.expirePending();
    const advanced = await this.advanceLeases();
    const reminders = await this.sendReminders();
    return { cancelled, advanced, reminders };
  }

  /** 把每个未结束的租约推进到当前时间应处的阶段，并同步机器状态 */
  async advanceLeases(): Promise<number> {
    const now = this.clock.now();
    const leases = await this.prisma.lease.findMany({
      where: { status: { not: 'ended' } },
      include: { device: true },
    });
    let n = 0;
    for (const l of leases) {
      let target: LeaseStatus = 'active';
      if (now >= l.graceEndAt) target = 'ended';
      else if (now >= l.endAt) target = 'grace';
      else if (l.endAt.getTime() - now.getTime() <= 7 * DAY_MS) target = 'expiring';
      if (RANK[target] <= RANK[l.status]) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          // 条件更新：并发 tick 时只有一个能推进
          const r = await tx.lease.updateMany({
            where: { id: l.id, status: l.status },
            data: { status: target, ...(target === 'ended' ? { endedAt: now } : {}) },
          });
          if (r.count !== 1) return;
          const d = l.device;
          if (d.currentLeaseId === l.id) {
            const to = target === 'ended' ? 'recycling' : target === 'active' ? 'in_use' : target;
            const path = devicePath(d.status, to);
            if (path && path.length) {
              await tx.device.updateMany({
                where: { id: d.id, status: d.status },
                data: {
                  status: path[path.length - 1]!,
                  ...(target === 'ended' ? { currentLeaseId: null } : {}),
                },
              });
            } else if (target === 'ended') {
              // 故障 / 维护中的机器：保持人工状态，只解除租约绑定
              await tx.device.update({ where: { id: d.id }, data: { currentLeaseId: null } });
            }
          }
          if (target === 'ended') {
            const open = await tx.lease.count({
              where: { orderId: l.orderId, status: { not: 'ended' } },
            });
            if (open === 0) {
              await tx.order.updateMany({
                where: { id: l.orderId, status: 'active' },
                data: { status: 'done' },
              });
            }
          }
          n++;
        });
      } catch (e) {
        this.log.error(`推进租约 ${l.id} 失败: ${String(e)}`);
      }
    }
    return n;
  }

  /** 每个提醒节点只发一次：用 ReminderLog 主键去重（key 含 endAt，续费后重新计） */
  private async once(keys: string[]): Promise<string[]> {
    const fresh: string[] = [];
    for (const key of keys) {
      const r = await this.prisma.reminderLog.createMany({
        data: [{ key }],
        skipDuplicates: true,
      });
      if (r.count === 1) fresh.push(key);
    }
    return fresh;
  }

  async sendReminders(): Promise<number> {
    const now = this.clock.now();
    const leases = await this.prisma.lease.findMany({
      where: { status: { not: 'ended' } },
      include: { device: true },
    });
    let sent = 0;
    for (const l of leases) {
      const base = `${l.id}:`;
      const sfx = `:${l.endAt.getTime()}`;
      const code = l.device.code;
      const end = l.endAt.toISOString().slice(0, 10);
      const left = l.endAt.getTime() - now.getTime();
      if (left > 0) {
        // 到期前 7 / 3 / 1 天：首次发现已落在较小节点时只发最小的那条，较大的静默记录
        const hit = EXPIRY_REMIND_DAYS.filter((d) => left <= d * DAY_MS);
        if (hit.length) {
          const fresh = await this.once(hit.map((d) => `${base}expiry_${d}${sfx}`));
          if (fresh.length) {
            const smallest = Math.min(
              ...hit.filter((d) => fresh.includes(`${base}expiry_${d}${sfx}`)),
            );
            await this.notify.notify(
              l.userId,
              `expiry_${smallest}`,
              `设备 ${code} 将在 ${smallest} 天内到期`,
              `你的设备 ${code} 将于 ${end} 到期。到期后有 3 天宽限期，之后机器会被回收并清空数据。请在「我的设备」续费，或提前备份数据。`,
              { leaseId: l.id },
            );
            sent++;
          }
        }
      } else {
        const graceLeft = l.graceEndAt.getTime() - now.getTime();
        if (graceLeft > 0) {
          const fresh = await this.once([`${base}grace_start${sfx}`]);
          if (fresh.length) {
            await this.notify.notify(
              l.userId,
              'grace_start',
              `设备 ${code} 已到期，进入宽限期`,
              `设备 ${code} 已于 ${end} 到期，宽限期内机器仍保留，宽限期结束后将被回收并清空数据。请尽快续费。`,
              { leaseId: l.id },
            );
            sent++;
          }
          if (graceLeft <= DAY_MS) {
            const f2 = await this.once([`${base}recycle_soon${sfx}`]);
            if (f2.length) {
              await this.notify.notify(
                l.userId,
                'recycle_soon',
                `设备 ${code} 将在 1 天内被回收`,
                `设备 ${code} 的宽限期即将结束，之后机器将被抹盘回收，数据无法恢复。如需继续使用请立即续费。`,
                { leaseId: l.id },
              );
              sent++;
            }
          }
        }
      }
    }
    return sent;
  }
}
