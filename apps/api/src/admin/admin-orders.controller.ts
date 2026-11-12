import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ORDER_STATUSES } from '@nyd/shared';
import type { AdminUser } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AdminGuard, CurrentAdmin, Roles } from './admin.guard.js';
import { AdminOrdersService, type DeviceAssignment } from './admin-orders.service.js';

const listQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const verifySchema = z.object({
  paidCents: z.number().int().positive(),
  xianyuOrderNo: z
    .string()
    .trim()
    .regex(/^\d{10,}$/, '闲鱼订单号为 10 位以上数字')
    .optional(),
  confirmedAmount: z.literal(true, { errorMap: () => ({ message: '请确认已核对金额' }) }),
  confirmedQuantity: z.literal(true, { errorMap: () => ({ message: '请确认已核对数量' }) }),
});
const reasonSchema = z.object({ reason: z.string().trim().min(2, '请填写原因').max(200) });
const activateSchema = z.object({
  devices: z
    .array(
      z.object({
        deviceId: z.string().min(1),
        uuDeviceCode: z.string().trim().min(1),
        uuPassword: z.string().min(1),
        macUsername: z.string().trim().min(1),
        macPassword: z.string().min(1),
      }),
    )
    .min(1)
    .max(10),
});

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminOrdersController {
  constructor(private svc: AdminOrdersService) {}

  // 查看订单：所有角色
  @Get('orders')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.list(q);
  }
  @Get('orders/:no')
  detail(@Param('no') no: string) {
    return this.svc.detail(no);
  }

  @Post('orders/:no/verify')
  @Roles('support')
  verify(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(verifySchema)) b: z.infer<typeof verifySchema>,
    @Req() req: Request,
  ) {
    return this.svc.verify(a, no, b as never, req.ip);
  }
  @Post('orders/:no/fail')
  @Roles('support')
  fail(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(reasonSchema)) b: { reason: string },
    @Req() req: Request,
  ) {
    return this.svc.fail(a, no, b.reason, req.ip);
  }
  @Post('orders/:no/cancel')
  @Roles('support')
  cancel(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(reasonSchema)) b: { reason: string },
    @Req() req: Request,
  ) {
    return this.svc.cancel(a, no, b.reason, req.ip);
  }

  @Get('provision/queue')
  @Roles('ops')
  queue() {
    return this.svc.queue();
  }
  @Post('orders/:no/activate')
  @Roles('ops')
  activate(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(activateSchema)) b: { devices: DeviceAssignment[] },
    @Req() req: Request,
  ) {
    return this.svc.activate(a, no, b.devices, req.ip);
  }

  @Post('orders/:no/refund')
  @Roles('admin')
  refund(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(reasonSchema)) b: { reason: string },
    @Req() req: Request,
  ) {
    return this.svc.refund(a, no, b.reason, req.ip);
  }
}
