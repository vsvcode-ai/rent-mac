import { Injectable } from '@nestjs/common';
import { availableStock } from '@nyd/shared';
import { OFFLINE_AFTER_MS } from '../admin/admin-ops.service.js';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PlansService {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
  ) {}

  /** 剩余可租 = 空闲机器数 − 「待开通」新租订单的台数合计 */
  async stock(): Promise<number> {
    const [idle, queued] = await Promise.all([
      this.prisma.device.count({ where: { status: 'idle' } }),
      this.prisma.order.aggregate({
        _sum: { quantity: true },
        where: { status: 'queued', kind: 'new' },
      }),
    ]);
    return availableStock(idle, queued._sum.quantity ?? 0);
  }

  async list() {
    const [plans, available] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: { months: 'asc' } }),
      this.stock(),
    ]);
    // 有离线的使用中机器时为 false（只统计装了心跳 agent 的机器）
    const cutoff = new Date(this.clock.now().getTime() - OFFLINE_AFTER_MS);
    const offline = await this.prisma.device.count({
      where: {
        status: { in: ['in_use', 'expiring', 'grace'] },
        heartbeatTokenHash: { not: null },
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
      },
    });
    return {
      available,
      allOnline: offline === 0,
      total: await this.prisma.device.count({ where: { status: { not: 'retired' } } }),
      plans: plans.map((p) => ({
        term: p.term,
        months: p.months,
        monthlyCents: p.monthlyCents,
        totalCents: p.monthlyCents * p.months,
        dedicatedSupport: p.dedicatedSupport,
        xianyuUrl: p.xianyuUrl,
        xianyuQrImage: p.xianyuQrImage,
      })),
    };
  }
}
