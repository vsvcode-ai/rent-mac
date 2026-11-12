import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVATION_WARN_DAYS,
  DAY_MS,
  HOUR_MS,
  VERIFY_REMIND_HOURS,
  assertDeviceTransition,
  assertOrderTransition,
  calcRefund,
  leaseDates,
  type OrderStatus,
} from '@nyd/shared';
import type { AdminUser, Order, Prisma } from '@prisma/client';
import { Clock } from '../common/clock.js';
import { devicePath } from '../leases/device-flow.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { NotifyService } from '../notify/notify.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { PlansService } from '../plans/plans.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

export interface DeviceAssignment {
  deviceId: string;
  uuDeviceCode: string;
  uuPassword: string;
  macUsername: string;
  macPassword: string;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private audit: AuditService,
    private notify: NotifyService,
    private crypto: CryptoService,
    private plans: PlansService,
    private settings: SettingsService,
  ) {}

  /** 给后台列表附带提醒标记：核对超 24 小时、开通剩余天数 / 超期 */
  private flags(o: Order) {
    const now = this.clock.now().getTime();
    const out: Record<string, unknown> = {};
    if (o.status === 'verifying' && o.xianyuSubmittedAt) {
      out.verifyOverdue = now - o.xianyuSubmittedAt.getTime() > VERIFY_REMIND_HOURS * HOUR_MS;
    }
    if (o.status === 'queued' && o.deadlineAt) {
      const left = o.deadlineAt.getTime() - now;
      out.remainingMs = left;
      out.deadlineLevel =
        left < 0 ? 'overdue' : left < ACTIVATION_WARN_DAYS * DAY_MS ? 'warn' : 'ok';
    }
    return out;
  }

  private view(o: Order & { user?: { email: string } }) {
    const { user, ...rest } = o;
    // 价格快照、用户 id 不外露
    const out: Record<string, unknown> = { ...rest, userEmail: user?.email, ...this.flags(o) };
    delete out.priceSnapshot;
    delete out.userId;
    return out;
  }

  async list(q: { status?: OrderStatus; keyword?: string; page: number; pageSize: number }) {
    const where: Prisma.OrderWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.keyword) {
      where.OR = [
        { no: { contains: q.keyword } },
        { xianyuOrderNo: { contains: q.keyword } },
        { user: { email: { contains: q.keyword, mode: 'insensitive' } } },
      ];
    }
    const [total, rows, groups] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      // 各状态的订单数，用于筛选条上的计数（不受当前筛选影响）
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
    ]);
    const counts: Record<string, number> = { all: groups.reduce((a, g) => a + g._count, 0) };
    for (const g of groups) counts[g.status] = g._count;
    return { total, counts, items: rows.map((o) => this.view(o)) };
  }

  async detail(no: string) {
    const o = await this.prisma.order.findUnique({
      where: { no },
      include: { user: { select: { email: true } }, leases: { include: { device: true } } },
    });
    if (!o) throw new NotFoundException('订单不存在');
    const { leases, ...rest } = o;
    return {
      ...this.view(rest as Order & { user: { email: string } }),
      devices: leases.map((l) => ({
        leaseId: l.id,
        code: l.device.code,
        publicIp: l.device.publicIp,
        startAt: l.startAt,
        endAt: l.endAt,
      })),
    };
  }

  private async load(no: string) {
    const o = await this.prisma.order.findUnique({ where: { no } });
    if (!o) throw new NotFoundException('订单不存在');
    return o;
  }

  /** 核对收款。金额不一致直接拒绝；数量只能人工比对，所以要求两项都明确勾选。 */
  async verify(
    admin: AdminUser,
    no: string,
    input: {
      paidCents: number;
      xianyuOrderNo?: string;
      confirmedAmount: true;
      confirmedQuantity: true;
    },
    ip?: string,
  ) {
    const o = await this.load(no);
    if (o.status !== 'verifying') throw new ConflictException('只有「待核对」的订单可以确认收款');
    assertOrderTransition(o.status, 'queued');
    if (input.paidCents !== o.totalCents) {
      throw new ConflictException(
        `实收金额与订单金额不一致（订单 ¥${o.totalCents / 100}，实收 ¥${input.paidCents / 100}），请先联系用户或标记核对失败`,
      );
    }
    if (input.xianyuOrderNo && input.xianyuOrderNo !== o.xianyuOrderNo) {
      const dup = await this.prisma.order.findFirst({
        where: {
          xianyuOrderNo: input.xianyuOrderNo,
          no: { not: no },
          status: { notIn: ['cancelled', 'failed'] },
        },
      });
      if (dup) throw new ConflictException('该闲鱼订单号已被其他订单使用');
    }
    if (o.kind === 'renew') return this.verifyRenew(admin, o, input, ip);
    const now = this.clock.now();
    const deadlineDays = await this.settings.number('activation.deadlineDays');
    const guard = await this.prisma.order.updateMany({
      where: { id: o.id, status: 'verifying' },
      data: {
        status: 'queued',
        paidCents: input.paidCents,
        paidAt: now,
        deadlineAt: new Date(now.getTime() + deadlineDays * DAY_MS),
        verifiedById: admin.id,
        verifiedAt: now,
        xianyuOrderNo: input.xianyuOrderNo ?? o.xianyuOrderNo,
      },
    });
    // 条件更新：重复点击 / 并发确认时只有一次生效
    if (guard.count !== 1) throw new ConflictException('订单状态已变化，请刷新后重试');
    const u = await this.load(no);
    await this.audit.log(
      admin.id,
      'order.verify',
      `order:${no}`,
      { paidCents: input.paidCents, xianyuOrderNo: u.xianyuOrderNo },
      ip,
    );
    await this.notify.notify(
      o.userId,
      'payment_confirmed',
      `订单 ${no} 已确认收款`,
      `我们已确认订单 ${no} 的付款，将在 ${deadlineDays} 天内为你开通，开通后会通过邮件和站内信通知你。`,
    );
    const stock = await this.plans.stock();
    return {
      order: this.view(u),
      stockWarning: stock < 0 ? '空闲机器不足以覆盖所有待开通订单，请尽快补充机器' : null,
      available: stock,
    };
  }

  async fail(admin: AdminUser, no: string, reason: string, ip?: string) {
    const o = await this.load(no);
    if (o.status !== 'verifying')
      throw new ConflictException('只有「待核对」的订单可以标记核对失败');
    assertOrderTransition(o.status, 'failed');
    const u = await this.prisma.order.update({
      where: { id: o.id },
      data: { status: 'failed', failedReason: reason },
    });
    await this.audit.log(admin.id, 'order.fail', `order:${no}`, { reason }, ip);
    await this.notify.notify(
      o.userId,
      'payment_failed',
      `订单 ${no} 付款核对未通过`,
      `原因：${reason}。请核对闲鱼订单号后在订单页重新提交，或联系客服。`,
    );
    return this.view(u);
  }

  async cancel(admin: AdminUser, no: string, reason: string, ip?: string) {
    const o = await this.load(no);
    assertOrderTransition(o.status, 'cancelled');
    const u = await this.prisma.order.update({
      where: { id: o.id },
      data: { status: 'cancelled', cancelledReason: reason },
    });
    await this.audit.log(admin.id, 'order.cancel', `order:${no}`, { reason }, ip);
    return this.view(u);
  }

  /** 开通队列：按开通截止时间升序 */
  async queue() {
    const rows = await this.prisma.order.findMany({
      where: { status: 'queued', kind: 'new' },
      include: { user: { select: { email: true } } },
      orderBy: { deadlineAt: 'asc' },
    });
    return rows.map((o) => this.view(o));
  }

  /** 完成开通：给订单分配 quantity 台空闲机器，录入凭证，生成租约（租期从开通当天起算） */
  async activate(admin: AdminUser, no: string, assignments: DeviceAssignment[], ip?: string) {
    const o = await this.load(no);
    if (o.status !== 'queued') throw new ConflictException('只有「待开通」的订单可以开通');
    assertOrderTransition(o.status, 'active');
    if (assignments.length !== o.quantity)
      throw new BadRequestException(`订单是 ${o.quantity} 台，请分配 ${o.quantity} 台机器`);
    if (new Set(assignments.map((a) => a.deviceId)).size !== assignments.length)
      throw new BadRequestException('同一台机器不能重复分配');

    const now = this.clock.now();
    const { endAt, graceEndAt } = leaseDates(
      now,
      o.months,
      await this.settings.number('lease.graceDays'),
    );
    const leaseIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const a of assignments) {
        const d = await tx.device.findUnique({ where: { id: a.deviceId } });
        if (!d) throw new BadRequestException('机器不存在');
        if (d.status !== 'idle')
          throw new ConflictException(`机器 ${d.code} 当前状态不是「空闲」，不能分配`);
        assertDeviceTransition('idle', 'assigned');
        assertDeviceTransition('assigned', 'in_use');
        const lease = await tx.lease.create({
          data: {
            deviceId: d.id,
            userId: o.userId,
            orderId: o.id,
            startAt: now,
            endAt,
            graceEndAt,
            status: 'active',
            credential: {
              create: {
                uuDeviceCode: a.uuDeviceCode,
                uuPasswordEnc: this.crypto.encrypt(a.uuPassword),
                macUsername: a.macUsername,
                macPasswordEnc: this.crypto.encrypt(a.macPassword),
              },
            },
          },
        });
        // 条件更新：并发开通同一台机器时，只有一个能成功
        const r = await tx.device.updateMany({
          where: { id: d.id, status: 'idle' },
          data: { status: 'in_use', currentLeaseId: lease.id },
        });
        if (r.count !== 1) throw new ConflictException(`机器 ${d.code} 已被占用`);
        ids.push(lease.id);
      }
      await tx.order.update({ where: { id: o.id }, data: { status: 'active' } });
      return ids;
    });
    await this.audit.log(
      admin.id,
      'order.activate',
      `order:${no}`,
      { deviceIds: assignments.map((a) => a.deviceId), leaseIds },
      ip,
    );
    await this.notify.notify(
      o.userId,
      'activated',
      `订单 ${no} 已开通`,
      `你的 ${o.quantity} 台 Mac mini 已开通，租期至 ${endAt.toISOString().slice(0, 10)}。登录后在「我的设备」查看 UU 远程连接信息。请在闲鱼确认收货。`,
    );
    return this.detail(no);
  }

  /** 续费单确认收款：延长租约。未过期从原到期顺延；已过期（宽限期内）从现在起算。 */
  private async verifyRenew(
    admin: AdminUser,
    o: Order,
    input: { paidCents: number; xianyuOrderNo?: string },
    ip?: string,
  ) {
    assertOrderTransition(o.status, 'renewed');
    const now = this.clock.now();
    const graceDays = await this.settings.number('lease.graceDays');
    const result = await this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.findUnique({
        where: { id: o.renewLeaseId ?? '' },
        include: { device: true },
      });
      if (!lease || lease.status === 'ended') {
        throw new ConflictException(
          '该设备租约已结束（机器已回收），无法续费，请标记核对失败并按退款流程处理',
        );
      }
      // 条件更新：重复点击 / 并发确认时只有一次生效
      const r = await tx.order.updateMany({
        where: { id: o.id, status: 'verifying' },
        data: {
          status: 'renewed',
          paidCents: input.paidCents,
          paidAt: now,
          verifiedById: admin.id,
          verifiedAt: now,
          xianyuOrderNo: input.xianyuOrderNo ?? o.xianyuOrderNo,
        },
      });
      if (r.count !== 1) throw new ConflictException('订单状态已变化，请刷新后重试');
      const base = lease.endAt > now ? lease.endAt : now;
      const { endAt, graceEndAt } = leaseDates(base, o.months, graceDays);
      await tx.lease.update({
        where: { id: lease.id },
        data: { endAt, graceEndAt, status: 'active' },
      });
      if (lease.device.currentLeaseId === lease.id) {
        const path = devicePath(lease.device.status, 'in_use');
        if (path && path.length) {
          await tx.device.updateMany({
            where: { id: lease.device.id, status: lease.device.status },
            data: { status: 'in_use' },
          });
        }
      }
      await tx.leaseRenewal.create({
        data: { leaseId: lease.id, orderId: o.id, prevEndAt: lease.endAt, newEndAt: endAt },
      });
      return { endAt, code: lease.device.code };
    });
    await this.audit.log(
      admin.id,
      'order.verify',
      `order:${o.no}`,
      { paidCents: input.paidCents, renew: true, newEndAt: result.endAt.toISOString() },
      ip,
    );
    await this.notify.notify(
      o.userId,
      'renewed',
      `设备 ${result.code} 续费成功`,
      `订单 ${o.no} 已确认收款，设备 ${result.code} 的到期时间已延长至 ${result.endAt.toISOString().slice(0, 10)}。`,
    );
    const updated = await this.load(o.no);
    return {
      order: this.view(updated),
      stockWarning: null,
      available: await this.plans.stock(),
      newEndAt: result.endAt,
    };
  }

  // ---------------- 退款 ----------------

  /** 退款建议金额（按退款政策）。daysUsed 从租约开通日起算。 */
  async refundPreview(no: string, opts: { unfixable: boolean; aup: boolean }) {
    const o = await this.load(no);
    if (o.paidCents == null) throw new ConflictException('订单尚未确认收款，无退款金额可算');
    const lease = await this.prisma.lease.findFirst({
      where: { orderId: o.id },
      orderBy: { startAt: 'asc' },
    });
    const now = this.clock.now().getTime();
    const activated = !!lease;
    const elapsed = lease ? Math.max(0, now - lease.startAt.getTime()) : 0;
    const daysUsed = Math.floor(elapsed / DAY_MS);
    const r = calcRefund({
      term: o.term,
      paidCents: o.paidCents,
      quantity: o.quantity,
      activated,
      hoursSinceActivation: elapsed / HOUR_MS,
      unfixableWithinWindow: opts.unfixable,
      daysUsed,
      aupViolation: opts.aup,
    });
    return {
      paidCents: o.paidCents,
      suggestedCents: r.refundCents,
      reason: r.reason,
      daysUsed,
      usedMonths: activated ? Math.max(1, Math.ceil(daysUsed / 30)) : 0,
      activated,
    };
  }

  /**
   * 退款登记：待开通 / 使用中 → 退款中（带闲鱼退款单号则直接完成为已退款）。
   * 使用中的订单同时结束租约，机器进入「回收中」等待抹盘。
   */
  async refund(
    admin: AdminUser,
    no: string,
    input: { reason: string; amountCents: number; xianyuRefundNo?: string },
    ip?: string,
  ) {
    const o = await this.load(no);
    if (o.kind !== 'new' || (o.status !== 'queued' && o.status !== 'active'))
      throw new ConflictException('只有待开通或使用中的订单可以退款');
    assertOrderTransition(o.status, 'refunding');
    if (o.paidCents == null) throw new ConflictException('订单尚未确认收款');
    if (input.amountCents > o.paidCents) throw new BadRequestException('退款金额不能超过实付金额');
    const preview = await this.refundPreview(no, { unfixable: false, aup: false });
    const now = this.clock.now();
    const done = !!input.xianyuRefundNo;
    const ended = await this.prisma.$transaction(async (tx) => {
      const r = await tx.order.updateMany({
        where: { id: o.id, status: o.status },
        data: { status: done ? 'refunded' : 'refunding' },
      });
      if (r.count !== 1) throw new ConflictException('订单状态已变化，请刷新后重试');
      const leases = await tx.lease.findMany({
        where: { orderId: o.id, status: { not: 'ended' } },
        include: { device: true },
      });
      for (const l of leases) {
        await tx.lease.update({ where: { id: l.id }, data: { status: 'ended', endedAt: now } });
        if (l.device.currentLeaseId !== l.id) continue;
        const path = devicePath(l.device.status, 'recycling');
        await tx.device.update({
          where: { id: l.deviceId },
          data: { currentLeaseId: null, ...(path && path.length ? { status: 'recycling' } : {}) },
        });
      }
      await tx.refund.create({
        data: {
          orderId: o.id,
          reason: input.reason,
          amountCents: input.amountCents,
          calcDetail: preview,
          status: done ? 'refunded' : 'refunding',
          xianyuRefundNo: input.xianyuRefundNo,
          operatorId: admin.id,
        },
      });
      return leases.length;
    });
    await this.audit.log(
      admin.id,
      'order.refund',
      `order:${no}`,
      {
        reason: input.reason,
        amountCents: input.amountCents,
        suggestedCents: preview.suggestedCents,
        xianyuRefundNo: input.xianyuRefundNo ?? null,
        endedLeases: ended,
      },
      ip,
    );
    return this.detail(no);
  }

  async completeRefund(admin: AdminUser, id: string, xianyuRefundNo: string, ip?: string) {
    const rf = await this.prisma.refund.findUnique({ where: { id }, include: { order: true } });
    if (!rf) throw new NotFoundException('退款单不存在');
    if (rf.status !== 'refunding') throw new ConflictException('该退款单已完成');
    assertOrderTransition(rf.order.status, 'refunded');
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.updateMany({
        where: { id, status: 'refunding' },
        data: { status: 'refunded', xianyuRefundNo },
      });
      if (r.count !== 1) throw new ConflictException('该退款单已完成');
      await tx.order.update({ where: { id: rf.orderId }, data: { status: 'refunded' } });
    });
    await this.audit.log(
      admin.id,
      'refund.complete',
      `order:${rf.order.no}`,
      { refundId: id, xianyuRefundNo, amountCents: rf.amountCents },
      ip,
    );
    return { id, status: 'refunded' as const };
  }

  async listRefunds(status?: 'refunding' | 'refunded') {
    const rows = await this.prisma.refund.findMany({
      where: status ? { status } : {},
      include: { order: { select: { no: true, user: { select: { email: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      orderNo: r.order.no,
      userEmail: r.order.user.email,
      amountCents: r.amountCents,
      reason: r.reason,
      status: r.status,
      xianyuRefundNo: r.xianyuRefundNo,
      createdAt: r.createdAt,
    }));
  }

  /**
   * 开通超期补偿：开通时间晚于开通截止时，每超 1 天把所有租约延长 1 天。每个订单只能补偿一次。
   */
  async compensate(admin: AdminUser, no: string, ip?: string) {
    const o = await this.load(no);
    if (o.status !== 'active' || !o.deadlineAt)
      throw new ConflictException('只有已开通的订单可以补偿');
    const leases = await this.prisma.lease.findMany({
      where: { orderId: o.id, status: { not: 'ended' } },
    });
    if (!leases.length) throw new ConflictException('订单没有进行中的租约');
    const startAt = leases.reduce((m, l) => (l.startAt < m ? l.startAt : m), leases[0]!.startAt);
    const days = Math.floor((startAt.getTime() - o.deadlineAt.getTime()) / DAY_MS);
    if (days <= 0) throw new BadRequestException('开通超期不足 1 天，无需补偿');
    await this.prisma.$transaction(async (tx) => {
      const g = await tx.reminderLog.createMany({
        data: [{ key: `compensate:${o.id}` }],
        skipDuplicates: true,
      });
      if (g.count !== 1) throw new ConflictException('该订单已补偿过');
      for (const l of leases) {
        await tx.lease.update({
          where: { id: l.id },
          data: {
            endAt: new Date(l.endAt.getTime() + days * DAY_MS),
            graceEndAt: new Date(l.graceEndAt.getTime() + days * DAY_MS),
          },
        });
      }
    });
    await this.audit.log(admin.id, 'order.compensate', `order:${no}`, { days }, ip);
    await this.notify.notify(
      o.userId,
      'compensated',
      `订单 ${no} 已补偿 ${days} 天`,
      `因订单开通超过承诺时限，我们已为你的设备补偿 ${days} 天租期。`,
    );
    return { days };
  }
}
