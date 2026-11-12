import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVATION_DEADLINE_DAYS,
  ACTIVATION_WARN_DAYS,
  DAY_MS,
  GRACE_DAYS,
  HOUR_MS,
  VERIFY_REMIND_HOURS,
  assertDeviceTransition,
  assertOrderTransition,
  leaseDates,
  type OrderStatus,
} from '@nyd/shared';
import type { AdminUser, Order, Prisma } from '@prisma/client';
import { Clock } from '../common/clock.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { NotifyService } from '../notify/notify.service.js';
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
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, items: rows.map((o) => this.view(o)) };
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
    const now = this.clock.now();
    const u = await this.prisma.order.update({
      where: { id: o.id },
      data: {
        status: 'queued',
        paidCents: input.paidCents,
        paidAt: now,
        deadlineAt: new Date(now.getTime() + ACTIVATION_DEADLINE_DAYS * DAY_MS),
        verifiedById: admin.id,
        verifiedAt: now,
        xianyuOrderNo: input.xianyuOrderNo ?? o.xianyuOrderNo,
      },
    });
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
      `我们已确认订单 ${no} 的付款，将在 ${ACTIVATION_DEADLINE_DAYS} 天内为你开通，开通后会通过邮件和站内信通知你。`,
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
    const { endAt, graceEndAt } = leaseDates(now, o.months, GRACE_DAYS);
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

  /**
   * 退款登记（首版简化）：待开通 / 使用中 → 已退款。
   * 使用中的订单会同时结束租约，机器进入「回收中」等待抹盘。完整的金额计算和退款单在 M2。
   */
  async refund(admin: AdminUser, no: string, reason: string, ip?: string) {
    const o = await this.load(no);
    if (o.status !== 'queued' && o.status !== 'active')
      throw new ConflictException('只有待开通或使用中的订单可以退款');
    assertOrderTransition(o.status, 'refunding');
    assertOrderTransition('refunding', 'refunded');
    const leases = await this.prisma.lease.findMany({
      where: { orderId: o.id, status: { not: 'ended' } },
      include: { device: true },
    });
    await this.prisma.$transaction(async (tx) => {
      for (const l of leases) {
        assertDeviceTransition(l.device.status, 'recycling');
        await tx.lease.update({ where: { id: l.id }, data: { status: 'ended' } });
        await tx.device.update({
          where: { id: l.deviceId },
          data: { status: 'recycling', currentLeaseId: null },
        });
      }
      await tx.refund.create({
        data: {
          orderId: o.id,
          reason,
          amountCents: o.paidCents ?? o.totalCents,
          calcDetail: { note: '首版手动登记' },
          status: 'refunded',
          operatorId: admin.id,
        },
      });
      await tx.order.update({ where: { id: o.id }, data: { status: 'refunded' } });
    });
    await this.audit.log(
      admin.id,
      'order.refund',
      `order:${no}`,
      { reason, endedLeases: leases.length },
      ip,
    );
    return this.detail(no);
  }
}
