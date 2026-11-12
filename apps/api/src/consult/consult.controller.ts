import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminUser } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminGuard, CurrentAdmin, Roles } from '../admin/admin.guard.js';
import { AuditService } from '../admin/audit.service.js';
import { Kv } from '../common/kv.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

const createSchema = z.object({
  contact: z.string().trim().min(2, '请留下联系方式').max(100),
  quantity: z.number().int().min(1).max(1000).optional(),
  message: z.string().trim().min(2, '请简单描述需求').max(2000),
});
const STATUSES = ['new', 'following', 'done'] as const;
const listQuery = z.object({ status: z.enum(STATUSES).optional() });
const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  note: z.string().trim().max(500).optional(),
});

@Injectable()
export class ConsultService {
  constructor(
    private prisma: PrismaService,
    private kv: Kv,
    private audit: AuditService,
  ) {}

  async create(ip: string, b: z.infer<typeof createSchema>) {
    if ((await this.kv.incr(`consult:ip:${ip}`, 3600)) > 5)
      throw new HttpException('提交过于频繁，请稍后再试', 429);
    await this.prisma.consult.create({
      data: { contact: b.contact, quantity: b.quantity, message: b.message },
    });
  }

  list(status?: (typeof STATUSES)[number]) {
    return this.prisma.consult.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async patch(admin: AdminUser, id: string, b: z.infer<typeof patchSchema>, ip?: string) {
    const c = await this.prisma.consult.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('咨询不存在');
    const u = await this.prisma.consult.update({ where: { id }, data: b });
    await this.audit.log(admin.id, 'consult.update', `consult:${id}`, { ...b }, ip);
    return u;
  }
}

@Controller()
export class ConsultController {
  constructor(private svc: ConsultService) {}

  @Post('consult')
  @HttpCode(204)
  create(@Body(new ZodPipe(createSchema)) b: z.infer<typeof createSchema>, @Req() req: Request) {
    return this.svc.create(req.ip ?? '', b);
  }

  @Get('admin/consults')
  @UseGuards(AdminGuard)
  @Roles('support')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.list(q.status);
  }

  @Patch('admin/consults/:id')
  @UseGuards(AdminGuard)
  @Roles('support')
  patch(
    @CurrentAdmin() a: AdminUser,
    @Param('id') id: string,
    @Body(new ZodPipe(patchSchema)) b: z.infer<typeof patchSchema>,
    @Req() req: Request,
  ) {
    return this.svc.patch(a, id, b, req.ip);
  }
}
