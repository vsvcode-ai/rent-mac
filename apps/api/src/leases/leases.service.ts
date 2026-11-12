import { Injectable, NotFoundException } from '@nestjs/common';
import { DAY_MS } from '@nyd/shared';
import { AuditService } from '../admin/audit.service.js';
import { Clock } from '../common/clock.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LeasesService {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  async mine(userId: string) {
    const rows = await this.prisma.lease.findMany({
      where: { userId, status: { not: 'ended' } },
      include: { device: true, order: { select: { no: true } } },
      orderBy: { startAt: 'desc' },
    });
    const now = this.clock.now().getTime();
    return rows.map((l) => ({
      id: l.id,
      deviceCode: l.device.code,
      publicIp: l.device.publicIp,
      deviceStatus: l.device.status,
      orderNo: l.order.no,
      startAt: l.startAt,
      endAt: l.endAt,
      graceEndAt: l.graceEndAt,
      status: l.status,
      daysLeft: Math.ceil((l.endAt.getTime() - now) / DAY_MS),
    }));
  }

  /** 用户查看自己的连接信息：解密返回，并记录一次查看 */
  async credentialForUser(userId: string, leaseId: string, ip?: string, ua?: string) {
    const l = await this.prisma.lease.findFirst({
      where: { id: leaseId, userId, status: { not: 'ended' } },
      include: { credential: true },
    });
    if (!l?.credential) throw new NotFoundException('设备不存在');
    await this.prisma.credentialView.create({ data: { leaseId, userId, ip, userAgent: ua } });
    return this.decrypt(l.credential);
  }

  /** 后台查看（运维 / 管理员）：同样记录，并写审计日志 */
  async credentialForAdmin(adminId: string, leaseId: string, ip?: string, ua?: string) {
    const l = await this.prisma.lease.findUnique({
      where: { id: leaseId },
      include: { credential: true },
    });
    if (!l?.credential) throw new NotFoundException('设备不存在');
    await this.prisma.credentialView.create({ data: { leaseId, adminId, ip, userAgent: ua } });
    await this.audit.log(adminId, 'credential.view', `lease:${leaseId}`, undefined, ip);
    return this.decrypt(l.credential);
  }

  private decrypt(c: {
    uuDeviceCode: string;
    uuPasswordEnc: string;
    macUsername: string;
    macPasswordEnc: string;
  }) {
    return {
      uuDeviceCode: c.uuDeviceCode,
      uuPassword: this.crypto.decrypt(c.uuPasswordEnc),
      macUsername: c.macUsername,
      macPassword: this.crypto.decrypt(c.macPasswordEnc),
    };
  }
}
