import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AdminUser } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AdminGuard, CurrentAdmin, Roles } from './admin.guard.js';
import { AdminOpsService } from './admin-ops.service.js';

const recycleSchema = z.object({
  wiped: z.literal(true, { errorMap: () => ({ message: '请确认已抹盘重装' }) }),
  uuReset: z.literal(true, { errorMap: () => ({ message: '请确认已重置 UU 远程' }) }),
  passwordChanged: z.literal(true, { errorMap: () => ({ message: '请确认已更换密码' }) }),
});
const exportQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
});
const usersQuery = z.object({
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const userPatch = z.object({ status: z.enum(['active', 'disabled']) });

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminOpsController {
  constructor(private svc: AdminOpsService) {}

  @Get('recycle')
  @Roles('ops')
  recycle() {
    return this.svc.recycleList();
  }

  @Post('recycle/:deviceId/complete')
  @HttpCode(200)
  @Roles('ops')
  recycleComplete(
    @CurrentAdmin() a: AdminUser,
    @Param('deviceId') id: string,
    @Body(new ZodPipe(recycleSchema)) _b: unknown,
    @Req() req: Request,
  ) {
    return this.svc.recycleComplete(a, id, req.ip);
  }

  @Get('dashboard')
  dashboard() {
    return this.svc.dashboard();
  }

  @Get('export/orders.csv')
  @Roles('support')
  async exportCsv(
    @Query(new ZodPipe(exportQuery)) q: z.infer<typeof exportQuery>,
    @Res() res: Response,
  ) {
    const csv = await this.svc.exportOrdersCsv(q.date);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${q.date}.csv"`);
    res.send(csv);
  }

  @Get('users')
  users(@Query(new ZodPipe(usersQuery)) q: z.infer<typeof usersQuery>) {
    return this.svc.users(q);
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.svc.userDetail(id);
  }

  @Patch('users/:id')
  @Roles('admin')
  setUser(
    @CurrentAdmin() a: AdminUser,
    @Param('id') id: string,
    @Body(new ZodPipe(userPatch)) b: { status: 'active' | 'disabled' },
    @Req() req: Request,
  ) {
    return this.svc.setUserStatus(a, id, b.status, req.ip);
  }

  @Get('admins')
  @Roles('admin')
  admins() {
    return this.svc.admins();
  }
}
