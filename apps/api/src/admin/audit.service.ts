import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  /** 查看凭证、确认收款、改价、退款等敏感操作都要调用 */
  log(
    adminId: string,
    action: string,
    target: string,
    detail?: Prisma.InputJsonValue,
    ip?: string,
  ) {
    return this.prisma.auditLog.create({ data: { adminId, action, target, detail, ip } });
  }
}
