import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ACTIVATION_WARN_DAYS, DAY_MS, HOUR_MS, VERIFY_REMIND_HOURS, getPlan } from '@nyd/shared';
import type { AdminUser, Prisma } from '@prisma/client';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

/** 心跳超过该时长视为离线 */
export const OFFLINE_AFTER_MS = 5 * 60_000;
const TZ_MS = 8 * HOUR_MS;

/** 当前时刻在 UTC+8 下的「本月 1 日 00:00」对应的 UTC 时间 */
function monthStart(now: Date) {
  const l = new Date(now.getTime() + TZ_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - TZ_MS);
}
const dayKey = (t: Date) => new Date(t.getTime() + TZ_MS).toISOString().slice(0, 10);

/** CSV 单元格：转义 + 防公式注入（以 = + - @ 开头的文本前面加单引号） */
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

@Injectable()
export class AdminOpsService {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private audit: AuditService,
  ) {}

  // ---------------- 回收 ----------------

  async recycleList() {
    const devices = await this.prisma.device.findMany({
      where: { status: 'recycling' },
      orderBy: { code: 'asc' },
    });
    const now = this.clock.now().getTime();
    const out = [];
    for (const d of devices) {
      const last = await this.prisma.lease.findFirst({
        where: { deviceId: d.id },
        orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
        include: { user: { select: { email: true } } },
      });
      const endedAt = last?.endedAt ?? last?.graceEndAt ?? null;
      out.push({
        deviceId: d.id,
        code: d.code,
        publicIp: d.publicIp,
        lessee: last?.user.email ?? null,
        endedAt,
        daysWaiting: endedAt ? Math.max(0, Math.floor((now - endedAt.getTime()) / DAY_MS)) : 0,
      });
    }
    return out;
  }

  /** 回收完成：三项检查必须全勾；机器回到空闲，旧凭证作废（记录删除） */
  async recycleComplete(admin: AdminUser, deviceId: string, ip?: string) {
    const d = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!d) throw new NotFoundException('机器不存在');
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.device.updateMany({
        where: { id: deviceId, status: 'recycling' },
        data: { status: 'idle', currentLeaseId: null },
      });
      if (r.count !== 1) throw new ConflictException('该机器不在回收队列中');
      const last = await tx.lease.findFirst({
        where: { deviceId },
        orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
      });
      await tx.recycleRecord.create({
        data: {
          deviceId,
          leaseId: last?.id,
          wipedAndReinstalled: true,
          uuReset: true,
          passwordChanged: true,
          operatorId: admin.id,
        },
      });
      await tx.credential.deleteMany({ where: { lease: { deviceId } } });
    });
    await this.audit.log(admin.id, 'device.recycle', `device:${d.code}`, undefined, ip);
    return { deviceId, status: 'idle' as const };
  }

  // ---------------- 看板 ----------------

  async dashboard() {
    const now = this.clock.now();
    const nowMs = now.getTime();
    const verifyCutoff = new Date(nowMs - VERIFY_REMIND_HOURS * HOUR_MS);
    const warnCutoff = new Date(nowMs + ACTIVATION_WARN_DAYS * DAY_MS);
    const from14 = new Date(monthStartDay(now).getTime() - 13 * DAY_MS);
    const mStart = monthStart(now);
    const [
      pendingVerify,
      verifyOverdue,
      queued,
      queuedWarn,
      queuedOverdue,
      statusGroups,
      expiring7,
      revenue,
      recent,
      openTickets,
      newConsults,
      offline,
    ] = await Promise.all([
      this.prisma.order.count({ where: { status: 'verifying' } }),
      this.prisma.order.count({
        where: { status: 'verifying', xianyuSubmittedAt: { lt: verifyCutoff } },
      }),
      this.prisma.order.count({ where: { status: 'queued', kind: 'new' } }),
      this.prisma.order.count({
        where: { status: 'queued', kind: 'new', deadlineAt: { gte: now, lt: warnCutoff } },
      }),
      this.prisma.order.count({
        where: { status: 'queued', kind: 'new', deadlineAt: { lt: now } },
      }),
      this.prisma.device.groupBy({ by: ['status'], _count: true }),
      this.prisma.lease.count({
        where: { status: { not: 'ended' }, endAt: { gte: now, lte: new Date(nowMs + 7 * DAY_MS) } },
      }),
      this.prisma.order.aggregate({
        _sum: { paidCents: true },
        where: { paidAt: { gte: mStart }, status: { not: 'refunded' } },
      }),
      this.prisma.order.findMany({
        where: { createdAt: { gte: from14 } },
        select: { createdAt: true },
      }),
      this.prisma.ticket.count({ where: { status: { in: ['open', 'processing'] } } }),
      this.prisma.consult.count({ where: { status: 'new' } }),
      this.offlineDevices(),
    ]);
    const cnt = (...s: string[]) =>
      statusGroups.filter((g) => s.includes(g.status)).reduce((a, g) => a + g._count, 0);
    const idle = cnt('idle');
    const leased = cnt('in_use', 'expiring', 'grace');
    const utilization = {
      total: statusGroups.filter((g) => g.status !== 'retired').reduce((a, g) => a + g._count, 0),
      leased,
      idle,
      maintenance: cnt('maintenance'),
      fault: cnt('fault'),
      recycling: cnt('recycling'),
    };
    const buckets = new Map<string, number>();
    for (let i = 13; i >= 0; i--) buckets.set(dayKey(new Date(nowMs - i * DAY_MS)), 0);
    for (const o of recent) {
      const k = dayKey(o.createdAt);
      if (buckets.has(k)) buckets.set(k, buckets.get(k)! + 1);
    }
    const todos: { type: string; text: string; href: string }[] = [];
    if (verifyOverdue)
      todos.push({
        type: 'verify_overdue',
        text: `${verifyOverdue} 笔订单待核对超过 ${VERIFY_REMIND_HOURS} 小时`,
        href: '/admin/orders?status=verifying',
      });
    else if (pendingVerify)
      todos.push({
        type: 'verify',
        text: `${pendingVerify} 笔订单待核对`,
        href: '/admin/orders?status=verifying',
      });
    if (queuedOverdue)
      todos.push({
        type: 'activation_overdue',
        text: `${queuedOverdue} 笔订单开通已超期`,
        href: '/admin/provision',
      });
    if (queuedWarn)
      todos.push({
        type: 'activation_warn',
        text: `${queuedWarn} 笔订单开通剩余不足 ${ACTIVATION_WARN_DAYS} 天`,
        href: '/admin/provision',
      });
    if (utilization.recycling)
      todos.push({
        type: 'recycle',
        text: `${utilization.recycling} 台机器等待回收`,
        href: '/admin/recycle',
      });
    if (openTickets)
      todos.push({ type: 'tickets', text: `${openTickets} 张工单待处理`, href: '/admin/tickets' });
    if (newConsults)
      todos.push({
        type: 'consults',
        text: `${newConsults} 条新咨询`,
        href: '/admin/consults',
      });
    if (offline.length)
      todos.push({
        type: 'offline',
        text: `${offline.length} 台使用中的机器离线：${offline
          .slice(0, 5)
          .map((d) => d.code)
          .join('、')}`,
        href: '/admin/devices',
      });
    return {
      pendingVerify,
      verifyOverdue,
      queued,
      queuedWarn,
      queuedOverdue,
      leased,
      idle,
      expiring7,
      monthRevenueCents: revenue._sum.paidCents ?? 0,
      ordersLast14d: [...buckets].map(([date, count]) => ({ date, count })),
      utilization,
      todos,
    };
  }

  /** 装了心跳 agent、正在租用、且心跳超时的机器 */
  async offlineDevices() {
    const cutoff = new Date(this.clock.now().getTime() - OFFLINE_AFTER_MS);
    return this.prisma.device.findMany({
      where: {
        status: { in: ['in_use', 'expiring', 'grace'] },
        heartbeatTokenHash: { not: null },
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
      },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    });
  }

  // ---------------- 对账导出 ----------------

  async exportOrdersCsv(date: string) {
    // date 是 UTC+8 的自然日
    const start = new Date(new Date(`${date}T00:00:00Z`).getTime() - TZ_MS);
    const end = new Date(start.getTime() + DAY_MS);
    const rows = await this.prisma.order.findMany({
      where: { paidAt: { gte: start, lt: end } },
      include: { user: { select: { email: true } } },
      orderBy: { paidAt: 'asc' },
    });
    const admins = await this.prisma.adminUser.findMany({ select: { id: true, name: true } });
    const names = new Map(admins.map((a) => [a.id, a.name]));
    const head = [
      '订单号',
      '类型',
      '用户邮箱',
      '租期',
      '台数',
      '应收',
      '实收',
      '闲鱼订单号',
      '闲鱼昵称',
      '确认收款时间',
      '经办人',
    ];
    const yuan = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));
    const lines = rows.map((o) =>
      [
        o.no,
        o.kind === 'renew' ? '续费' : '新租',
        o.user.email,
        getPlan(o.term).name,
        o.quantity,
        yuan(o.totalCents),
        yuan(o.paidCents),
        o.xianyuOrderNo,
        o.xianyuBuyerNick,
        o.paidAt
          ? new Date(o.paidAt.getTime() + TZ_MS).toISOString().slice(0, 19).replace('T', ' ')
          : '',
        o.verifiedById ? (names.get(o.verifiedById) ?? '') : '',
      ]
        .map(csvCell)
        .join(','),
    );
    return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
  }

  // ---------------- 用户管理 ----------------

  async users(q: { keyword?: string; page: number; pageSize: number }) {
    const where: Prisma.UserWhereInput = q.keyword
      ? {
          OR: [
            { email: { contains: q.keyword, mode: 'insensitive' } },
            { wechat: { contains: q.keyword, mode: 'insensitive' } },
            { telegram: { contains: q.keyword, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { orders: true } } },
      }),
    ]);
    const ids = rows.map((u) => u.id);
    const active = await this.prisma.lease.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: { not: 'ended' } },
      _count: true,
    });
    const by = new Map(active.map((a) => [a.userId, a._count]));
    return {
      total,
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        wechat: u.wechat,
        telegram: u.telegram,
        status: u.status,
        createdAt: u.createdAt,
        orderCount: u._count.orders,
        activeDevices: by.get(u.id) ?? 0,
      })),
    };
  }

  async userDetail(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' } },
        leases: { include: { device: true }, orderBy: { startAt: 'desc' } },
      },
    });
    if (!u) throw new NotFoundException('用户不存在');
    return {
      id: u.id,
      email: u.email,
      wechat: u.wechat,
      telegram: u.telegram,
      status: u.status,
      createdAt: u.createdAt,
      orders: u.orders.map((o) => ({
        no: o.no,
        kind: o.kind,
        term: o.term,
        quantity: o.quantity,
        totalCents: o.totalCents,
        status: o.status,
        createdAt: o.createdAt,
      })),
      // 不含凭证
      leases: u.leases.map((l) => ({
        id: l.id,
        deviceCode: l.device.code,
        publicIp: l.device.publicIp,
        status: l.status,
        startAt: l.startAt,
        endAt: l.endAt,
      })),
    };
  }

  async setUserStatus(admin: AdminUser, id: string, status: 'active' | 'disabled', ip?: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('用户不存在');
    await this.prisma.user.update({ where: { id }, data: { status } });
    // 禁用立即踢下线
    if (status === 'disabled') await this.prisma.session.deleteMany({ where: { userId: id } });
    await this.audit.log(
      admin.id,
      status === 'disabled' ? 'user.disable' : 'user.enable',
      `user:${id}`,
      { email: u.email },
      ip,
    );
    return { id, status };
  }

  async admins() {
    const rows = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      totpEnabled: !!a.totpEnabledAt,
      status: a.status,
    }));
  }
}

/** UTC+8 今天 00:00 对应的 UTC 时间 */
function monthStartDay(now: Date) {
  const l = new Date(now.getTime() + TZ_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - TZ_MS);
}
