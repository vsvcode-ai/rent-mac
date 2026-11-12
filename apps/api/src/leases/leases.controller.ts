import { Controller, Get, Param, Post, Req, UseGuards, HttpCode, Patch } from '@nestjs/common';
import type { AdminUser, User } from '@prisma/client';
import type { Request } from 'express';
import { AdminGuard, CurrentAdmin, Roles } from '../admin/admin.guard.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LeasesService } from './leases.service.js';

@Controller()
export class LeasesController {
  constructor(
    private svc: LeasesService,
    private prisma: PrismaService,
  ) {}

  @Get('me/leases')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() u: User) {
    return this.svc.mine(u.id);
  }

  // 用 GET 取明文凭证会被浏览器 / 代理缓存和预取，这里用 POST 并要求显式点击
  @Post('me/leases/:id/credential')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  credential(@CurrentUser() u: User, @Param('id') id: string, @Req() req: Request) {
    return this.svc.credentialForUser(u.id, id, req.ip, req.headers['user-agent']);
  }

  @Post('admin/leases/:id/credential')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @Roles('ops')
  adminCredential(@CurrentAdmin() a: AdminUser, @Param('id') id: string, @Req() req: Request) {
    return this.svc.credentialForAdmin(a.id, id, req.ip, req.headers['user-agent']);
  }

  @Get('me/notifications')
  @UseGuards(AuthGuard)
  async notifications(@CurrentUser() u: User) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: u.id, channel: 'site' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      unread: rows.filter((n) => !n.readAt).length,
      items: rows.map((n) => ({
        id: n.id,
        template: n.template,
        ...(n.payload as object),
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };
  }

  @Patch('me/notifications/read')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async readAll(@CurrentUser() u: User) {
    await this.prisma.notification.updateMany({
      where: { userId: u.id, channel: 'site', readAt: null },
      data: { readAt: new Date() },
    });
  }
}
