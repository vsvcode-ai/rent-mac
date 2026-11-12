import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DEVICE_STATUSES, assertDeviceTransition, type DeviceStatus } from '@nyd/shared';
import type { AdminUser, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { OFFLINE_AFTER_MS } from '../admin/admin-ops.service.js';
import { AuditService } from '../admin/audit.service.js';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ImportRow {
  code?: string;
  serial: string;
  rackLocation: string;
  publicIp: string;
  note?: string;
}
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private clock: Clock,
  ) {}

  async list(q: { status?: DeviceStatus; keyword?: string; page: number; pageSize: number }) {
    const where: Prisma.DeviceWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.keyword)
      where.OR = [
        { code: { contains: q.keyword, mode: 'insensitive' } },
        { serial: { contains: q.keyword, mode: 'insensitive' } },
        { publicIp: { contains: q.keyword } },
      ];
    const cutoff = new Date(this.clock.now().getTime() - OFFLINE_AFTER_MS);
    const [total, rows, groups, offline] = await Promise.all([
      this.prisma.device.count({ where }),
      this.prisma.device.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.device.groupBy({ by: ['status'], _count: true }),
      this.prisma.device.count({
        where: {
          heartbeatTokenHash: { not: null },
          OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
        },
      }),
    ]);
    const leaseIds = rows.map((r) => r.currentLeaseId).filter((x): x is string => !!x);
    const leases = await this.prisma.lease.findMany({
      where: { id: { in: leaseIds } },
      include: { user: { select: { email: true } } },
    });
    const byId = new Map(leases.map((l) => [l.id, l]));
    return {
      total,
      summary: {
        ...Object.fromEntries(
          DEVICE_STATUSES.map((s) => [s, groups.find((g) => g.status === s)?._count ?? 0]),
        ),
        offline,
      },
      items: rows.map((d) => {
        const l = d.currentLeaseId ? byId.get(d.currentLeaseId) : undefined;
        return {
          id: d.id,
          code: d.code,
          serial: d.serial,
          rackLocation: d.rackLocation,
          publicIp: d.publicIp,
          status: d.status,
          note: d.note,
          // null = 未装心跳 agent；true / false = 5 分钟内是否有心跳
          online: !d.heartbeatTokenHash ? null : !!d.lastHeartbeatAt && d.lastHeartbeatAt >= cutoff,
          lastHeartbeatAt: d.lastHeartbeatAt,
          lessee: l?.user.email ?? null,
          leaseId: l?.id ?? null,
          endAt: l?.endAt ?? null,
        };
      }),
    };
  }

  /** 开通时选机器用 */
  idle(limit: number) {
    return this.prisma.device.findMany({
      where: { status: 'idle' },
      orderBy: { code: 'asc' },
      take: limit,
      select: { id: true, code: true, publicIp: true, rackLocation: true },
    });
  }

  /** 手动改状态：只允许维护 / 故障 / 下架 / 恢复空闲，且必须符合状态机 */
  async setStatus(
    admin: AdminUser,
    id: string,
    to: DeviceStatus,
    note: string | undefined,
    ip?: string,
  ) {
    const d = await this.prisma.device.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('机器不存在');
    if (!['idle', 'maintenance', 'fault', 'retired'].includes(to))
      throw new BadRequestException('不能手动设置为该状态');
    if (d.currentLeaseId && to !== 'fault' && to !== 'maintenance')
      throw new ConflictException('机器正在租用中，不能直接改为该状态');
    if (d.status === 'recycling' && to === 'idle')
      throw new ConflictException('回收中的机器请在回收队列里完成检查清单');
    assertDeviceTransition(d.status, to);
    const u = await this.prisma.device.update({
      where: { id },
      data: { status: to, note: note ?? d.note },
    });
    await this.audit.log(
      admin.id,
      'device.status',
      `device:${d.code}`,
      { from: d.status, to, note },
      ip,
    );
    return { id: u.id, code: u.code, status: u.status };
  }

  /** 批量导入：全部校验通过才写入（要么全成功要么全不写），dryRun 只校验 */
  async importRows(admin: AdminUser, rows: ImportRow[], dryRun: boolean, ip?: string) {
    const errors: { row: number; message: string }[] = [];
    const [existing, last] = await Promise.all([
      this.prisma.device.findMany({ select: { code: true, serial: true, publicIp: true } }),
      this.prisma.device.findMany({ orderBy: { code: 'desc' }, take: 1, select: { code: true } }),
    ]);
    const used = {
      code: new Set(existing.map((d) => d.code)),
      serial: new Set(existing.map((d) => d.serial)),
      ip: new Set(existing.map((d) => d.publicIp)),
    };
    let next = Number(/(\d+)$/.exec(last[0]?.code ?? '')?.[1] ?? 0);
    const clean: Required<Pick<ImportRow, 'code' | 'serial' | 'rackLocation' | 'publicIp'>>[] &
      { note?: string }[] = [] as never;
    rows.forEach((r, i) => {
      const n = i + 1;
      const err = (m: string) => errors.push({ row: n, message: m });
      const serial = r.serial?.trim(),
        rack = r.rackLocation?.trim(),
        ip = r.publicIp?.trim();
      let code = r.code?.trim();
      if (!serial) return err('序列号不能为空');
      if (!rack) return err('机柜位置不能为空');
      if (!ip || !IPV4.test(ip)) return err(`固定 IP 格式不正确：${ip ?? ''}`);
      if (used.serial.has(serial)) return err(`序列号重复：${serial}`);
      if (used.ip.has(ip)) return err(`IP 重复：${ip}`);
      if (code && used.code.has(code)) return err(`设备编号重复：${code}`);
      if (!code) {
        do code = `NYD-MY-${String(++next).padStart(4, '0')}`;
        while (used.code.has(code));
      }
      used.serial.add(serial);
      used.ip.add(ip);
      used.code.add(code);
      (clean as unknown[]).push({
        code,
        serial,
        rackLocation: rack,
        publicIp: ip,
        note: r.note?.trim() || undefined,
      });
    });
    if (errors.length || dryRun) return { imported: 0, valid: clean.length, errors };
    await this.prisma.device.createMany({ data: clean as never });
    await this.audit.log(admin.id, 'device.import', 'devices', { count: clean.length }, ip);
    return { imported: clean.length, valid: clean.length, errors };
  }

  /** 重新生成心跳令牌：库里只存 SHA-256，明文只在这次返回 */
  async issueToken(admin: AdminUser, id: string, ip?: string) {
    const d = await this.prisma.device.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('机器不存在');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.device.update({
      where: { id },
      data: {
        heartbeatTokenHash: createHash('sha256').update(token).digest('hex'),
        lastHeartbeatAt: null,
      },
    });
    await this.audit.log(admin.id, 'device.token', `device:${d.code}`, undefined, ip);
    return { token };
  }

  async heartbeat(token: string | undefined) {
    if (!token) throw new UnauthorizedException('缺少设备令牌');
    const hash = createHash('sha256').update(token).digest('hex');
    const r = await this.prisma.device.updateMany({
      where: { heartbeatTokenHash: hash },
      data: { lastHeartbeatAt: this.clock.now() },
    });
    if (r.count !== 1) throw new UnauthorizedException('设备令牌无效');
  }
}
