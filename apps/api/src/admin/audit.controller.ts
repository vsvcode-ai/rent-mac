import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGuard, Roles } from './admin.guard.js';

const q = z.object({
  action: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  /** 审计日志：只有管理员能看 */
  @Get()
  @Roles('admin')
  async list(@Query(new ZodPipe(q)) f: z.infer<typeof q>) {
    const where = f.action ? { action: { startsWith: f.action } } : {};
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ]);
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.adminId))] } },
      select: { id: true, name: true, role: true },
    });
    const by = new Map(admins.map((a) => [a.id, a]));
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        target: r.target,
        detail: r.detail,
        ip: r.ip,
        createdAt: r.createdAt,
        adminName: by.get(r.adminId)?.name ?? '—',
        adminRole: by.get(r.adminId)?.role ?? null,
      })),
    };
  }
}
