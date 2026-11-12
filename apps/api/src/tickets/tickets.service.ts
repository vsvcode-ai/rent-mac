import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { formatOrderNo } from '@nyd/shared';
import type { AdminUser, Prisma, TicketStatus } from '@prisma/client';
import { AuditService } from '../admin/audit.service.js';
import { Clock } from '../common/clock.js';
import { Kv } from '../common/kv.js';
import { NotifyService } from '../notify/notify.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const TICKET_CATEGORIES = ['无法连接', '机器卡顿', '重置密码', '重启', '其他'] as const;

type TicketWithRels = Prisma.TicketGetPayload<{
  include: { notes: true; lease: { include: { device: { select: { code: true } } } } };
}>;

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private kv: Kv,
    private notify: NotifyService,
    private audit: AuditService,
  ) {}

  private async nextNo() {
    const now = this.clock.now();
    const day = 'T' + formatOrderNo(now, 0).slice(2, 8);
    const c = await this.prisma.orderCounter.upsert({
      where: { day },
      create: { day, seq: 1 },
      update: { seq: { increment: 1 } },
    });
    return `${day}${String(c.seq).padStart(4, '0')}`;
  }

  private include = {
    notes: { orderBy: { createdAt: 'asc' as const } },
    lease: { include: { device: { select: { code: true } } } },
  };

  async create(userId: string, input: { category: string; content: string; leaseId?: string }) {
    if ((await this.kv.incr(`ticket:rate:${userId}`, 3600)) > 10)
      throw new HttpException('提交过于频繁，请稍后再试', 429);
    if (input.leaseId) {
      const l = await this.prisma.lease.findFirst({ where: { id: input.leaseId, userId } });
      if (!l) throw new NotFoundException('设备不存在');
    }
    const t = await this.prisma.ticket.create({
      data: {
        no: await this.nextNo(),
        userId,
        leaseId: input.leaseId,
        category: input.category,
        content: input.content,
      },
      include: this.include,
    });
    return this.userView(t);
  }

  private userView(t: TicketWithRels) {
    return {
      no: t.no,
      category: t.category,
      content: t.content,
      status: t.status,
      createdAt: t.createdAt,
      leaseId: t.leaseId,
      deviceCode: t.lease?.device.code ?? null,
      // 内部备注对用户不可见
      notes: t.notes
        .filter((n) => !n.internal)
        .map((n) => ({ content: n.content, createdAt: n.createdAt, fromStaff: !n.fromUser })),
    };
  }

  async mine(userId: string) {
    const rows = await this.prisma.ticket.findMany({
      where: { userId },
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((t) => this.userView(t));
  }

  async reply(userId: string, no: string, content: string) {
    const t = await this.prisma.ticket.findFirst({ where: { no, userId } });
    if (!t) throw new NotFoundException('工单不存在');
    if (t.status === 'closed') throw new ConflictException('工单已关闭，请新建工单');
    await this.prisma.$transaction([
      this.prisma.ticketNote.create({ data: { ticketId: t.id, fromUser: true, content } }),
      // 用户追加留言：已解决的工单重新打开
      this.prisma.ticket.update({
        where: { id: t.id },
        data: { status: t.status === 'resolved' ? 'open' : t.status },
      }),
    ]);
  }

  // ---------------- 后台 ----------------

  private adminView(t: TicketWithRels & { user: { email: string } }, names: Map<string, string>) {
    return {
      no: t.no,
      category: t.category,
      content: t.content,
      status: t.status,
      userEmail: t.user.email,
      deviceCode: t.lease?.device.code ?? null,
      assigneeId: t.assigneeId,
      assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      notes: t.notes.map((n) => ({
        id: n.id,
        adminName: n.fromUser ? '用户' : (names.get(n.adminId ?? '') ?? '—'),
        fromUser: n.fromUser,
        content: n.content,
        internal: n.internal,
        createdAt: n.createdAt,
      })),
    };
  }

  private async names() {
    const a = await this.prisma.adminUser.findMany({ select: { id: true, name: true } });
    return new Map(a.map((x) => [x.id, x.name]));
  }

  async adminList(q: { status?: TicketStatus; keyword?: string; page: number; pageSize: number }) {
    const where: Prisma.TicketWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.keyword) {
      where.OR = [
        { no: { contains: q.keyword } },
        { content: { contains: q.keyword, mode: 'insensitive' } },
        { user: { email: { contains: q.keyword, mode: 'insensitive' } } },
      ];
    }
    const [total, rows, names] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: { ...this.include, user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.names(),
    ]);
    return { total, items: rows.map((t) => this.adminView(t, names)) };
  }

  private async load(no: string) {
    const t = await this.prisma.ticket.findUnique({ where: { no } });
    if (!t) throw new NotFoundException('工单不存在');
    return t;
  }

  async adminUpdate(
    admin: AdminUser,
    no: string,
    b: { status?: TicketStatus; assigneeId?: string | null },
    ip?: string,
  ) {
    const t = await this.load(no);
    if (b.assigneeId) {
      const a = await this.prisma.adminUser.findUnique({ where: { id: b.assigneeId } });
      if (!a || a.status !== 'active') throw new NotFoundException('指派对象不存在');
    }
    await this.prisma.ticket.update({
      where: { id: t.id },
      data: {
        ...(b.status ? { status: b.status } : {}),
        ...(b.assigneeId !== undefined ? { assigneeId: b.assigneeId } : {}),
      },
    });
    await this.audit.log(admin.id, 'ticket.update', `ticket:${no}`, { ...b }, ip);
    if (b.status === 'resolved' && t.status !== 'resolved') {
      await this.notify.notify(
        t.userId,
        'ticket_resolved',
        `工单 ${no} 已处理`,
        `你提交的工单（${t.category}）已标记为已解决。如问题仍未解决，可以在工单里继续留言。`,
      );
    }
    const [full, names] = await Promise.all([
      this.prisma.ticket.findUniqueOrThrow({
        where: { id: t.id },
        include: { ...this.include, user: { select: { email: true } } },
      }),
      this.names(),
    ]);
    return this.adminView(full, names);
  }

  async adminNote(
    admin: AdminUser,
    no: string,
    b: { content: string; internal: boolean },
    ip?: string,
  ) {
    const t = await this.load(no);
    await this.prisma.ticketNote.create({
      data: { ticketId: t.id, adminId: admin.id, content: b.content, internal: b.internal },
    });
    await this.audit.log(admin.id, 'ticket.note', `ticket:${no}`, { internal: b.internal }, ip);
    if (!b.internal) {
      await this.notify.notify(
        t.userId,
        'ticket_reply',
        `工单 ${no} 有新回复`,
        `客服回复：${b.content}`,
      );
    }
  }

  async staff() {
    const rows = await this.prisma.adminUser.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }
}
