import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DEVICE_STATUSES, type DeviceStatus } from '@nyd/shared';
import type { AdminUser } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminGuard, CurrentAdmin, Roles } from '../admin/admin.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DevicesService, type ImportRow } from './devices.service.js';

const listQuery = z.object({
  status: z.enum(DEVICE_STATUSES).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const statusSchema = z.object({
  status: z.enum(DEVICE_STATUSES),
  note: z.string().trim().max(200).optional(),
});
const importSchema = z.object({
  dryRun: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        code: z.string().optional(),
        serial: z.string(),
        rackLocation: z.string(),
        publicIp: z.string(),
        note: z.string().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

@Controller('admin/devices')
@UseGuards(AdminGuard)
export class DevicesController {
  constructor(private svc: DevicesService) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.list(q as never);
  }
  @Get('idle')
  @Roles('ops')
  idle() {
    return this.svc.idle(300);
  }
  @Patch(':id/status')
  @Roles('ops')
  status(
    @CurrentAdmin() a: AdminUser,
    @Param('id') id: string,
    @Body(new ZodPipe(statusSchema)) b: { status: DeviceStatus; note?: string },
    @Req() req: Request,
  ) {
    return this.svc.setStatus(a, id, b.status, b.note, req.ip);
  }
  @Post(':id/token')
  @Roles('ops')
  token(@CurrentAdmin() a: AdminUser, @Param('id') id: string, @Req() req: Request) {
    return this.svc.issueToken(a, id, req.ip);
  }
  @Post('import')
  @Roles('ops')
  import(
    @CurrentAdmin() a: AdminUser,
    @Body(new ZodPipe(importSchema)) b: { dryRun: boolean; rows: ImportRow[] },
    @Req() req: Request,
  ) {
    return this.svc.importRows(a, b.rows, b.dryRun, req.ip);
  }
}

const heartbeatSchema = z.object({
  uptimeSec: z.number().nonnegative().optional(),
  load: z.number().nonnegative().optional(),
});

/** 机器上的 agent 调用：用设备令牌而不是用户 / 管理员会话 */
@Controller('heartbeat')
export class HeartbeatController {
  constructor(private svc: DevicesService) {}

  @Post()
  @HttpCode(204)
  async beat(
    @Headers('x-device-token') token: string | undefined,
    @Body(new ZodPipe(heartbeatSchema)) _b: unknown,
  ) {
    await this.svc.heartbeat(token);
  }
}
