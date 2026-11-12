import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVATION_DEADLINE_DAYS,
  HOUR_MS,
  assertOrderTransition,
  calcPrice,
  formatOrderNo,
  type CreateOrderInput,
  type SubmitXianyuInput,
} from '@nyd/shared';
import type { Order, Plan, Prisma } from '@prisma/client';
import { SettingsService } from '../settings/settings.service.js';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

export function orderView(o: Order, plan?: Plan | null) {
  return {
    no: o.no,
    kind: o.kind,
    term: o.term,
    months: o.months,
    quantity: o.quantity,
    unitCents: o.unitCents,
    totalCents: o.totalCents,
    contactWechat: o.contactWechat,
    contactTelegram: o.contactTelegram,
    xianyuOrderNo: o.xianyuOrderNo,
    xianyuBuyerNick: o.xianyuBuyerNick,
    status: o.status,
    failedReason: o.failedReason,
    expiresAt: o.expiresAt,
    paidAt: o.paidAt,
    deadlineAt: o.deadlineAt,
    createdAt: o.createdAt,
    xianyuUrl: plan?.xianyuUrl ?? null,
    xianyuQrImage: plan?.xianyuQrImage ?? null,
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private settings: SettingsService,
  ) {}

  private async nextOrderNo(now: Date) {
    const no0 = formatOrderNo(now, 0);
    const day = no0.slice(2, 8);
    const c = await this.prisma.orderCounter.upsert({
      where: { day },
      create: { day, seq: 1 },
      update: { seq: { increment: 1 } },
    });
    return formatOrderNo(now, c.seq);
  }

  async create(userId: string, input: CreateOrderInput) {
    if (input.kind === 'renew') throw new BadRequestException('续费功能暂未开放');
    const plan = await this.prisma.plan.findUnique({ where: { term: input.term } });
    if (!plan) throw new BadRequestException('套餐不存在');
    const base = await this.prisma.plan.findUnique({ where: { term: 'm1' } });
    const defs = [plan, base].filter(Boolean).map((p) => ({
      term: p!.term,
      name: p!.term,
      months: p!.months,
      monthlyCents: p!.monthlyCents,
      dedicatedSupport: p!.dedicatedSupport,
    }));
    const price = calcPrice(input.term, input.quantity, defs);
    const now = this.clock.now();
    const o = await this.prisma.order.create({
      data: {
        no: await this.nextOrderNo(now),
        userId,
        kind: 'new',
        term: plan.term,
        months: plan.months,
        quantity: input.quantity,
        unitCents: plan.monthlyCents,
        totalCents: price.totalCents,
        priceSnapshot: {
          ...price,
          plan: { term: plan.term, monthlyCents: plan.monthlyCents },
        } as unknown as Prisma.InputJsonValue,
        contactWechat: input.contactWechat || null,
        contactTelegram: input.contactTelegram || null,
        status: 'pending',
        expiresAt: new Date(
          now.getTime() + (await this.settings.number('order.pendingExpireHours')) * HOUR_MS,
        ),
      },
    });
    return orderView(o, plan);
  }

  private async own(userId: string, no: string) {
    const o = await this.prisma.order.findFirst({ where: { no, userId } });
    if (!o) throw new NotFoundException('订单不存在');
    return o;
  }

  async get(userId: string, no: string) {
    const o = await this.own(userId, no);
    return orderView(o, await this.prisma.plan.findUnique({ where: { term: o.term } }));
  }

  async list(userId: string) {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((o) => orderView(o));
  }

  async submitXianyu(userId: string, no: string, input: SubmitXianyuInput) {
    const o = await this.own(userId, no);
    if (o.status !== 'pending' && o.status !== 'failed')
      throw new ConflictException('当前订单状态不能提交闲鱼订单号');
    assertOrderTransition(o.status, 'verifying');
    if (o.status === 'pending' && o.expiresAt && o.expiresAt <= this.clock.now()) {
      throw new ConflictException('订单已超时，请重新下单');
    }
    const dup = await this.prisma.order.findFirst({
      where: {
        xianyuOrderNo: input.xianyuOrderNo,
        no: { not: no },
        status: { notIn: ['cancelled', 'failed'] },
      },
    });
    if (dup) throw new ConflictException('该闲鱼订单号已被其他订单使用，请检查后重试');
    const updated = await this.prisma.order.update({
      where: { id: o.id },
      data: {
        status: 'verifying',
        xianyuOrderNo: input.xianyuOrderNo,
        xianyuBuyerNick: input.xianyuBuyerNick,
        xianyuSubmittedAt: this.clock.now(),
        failedReason: null,
      },
    });
    return orderView(updated);
  }

  async cancel(userId: string, no: string) {
    const o = await this.own(userId, no);
    if (o.status !== 'pending') throw new ConflictException('只有待付款的订单可以取消');
    const u = await this.prisma.order.update({
      where: { id: o.id },
      data: { status: 'cancelled', cancelledReason: '用户取消' },
    });
    return orderView(u);
  }

  /** 定时任务：待付款超过 48 小时自动取消 */
  async expirePending(): Promise<number> {
    const r = await this.prisma.order.updateMany({
      where: { status: 'pending', expiresAt: { lte: this.clock.now() } },
      data: { status: 'cancelled', cancelledReason: '超时未付款，系统自动取消' },
    });
    return r.count;
  }

  /** 核对收款通过后设置开通截止时间（供管理端调用） */
  deadlineFrom(paidAt: Date) {
    return new Date(paidAt.getTime() + ACTIVATION_DEADLINE_DAYS * 86_400_000);
  }
}
