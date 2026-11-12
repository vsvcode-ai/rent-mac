import {
  Body,
  Controller,
  HttpCode,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import { z } from 'zod';
import { userView } from '../auth/auth.controller.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { SESSION_COOKIE, hashToken } from '../auth/session.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

const profileSchema = z.object({
  wechat: z.string().trim().max(64).optional(),
  telegram: z.string().trim().max(64).optional(),
});
const passwordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, '密码至少 8 位').max(128),
});

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private prisma: PrismaService) {}

  @Patch()
  async update(
    @CurrentUser() u: User,
    @Body(new ZodPipe(profileSchema)) b: z.infer<typeof profileSchema>,
  ) {
    const data: { wechat?: string | null; telegram?: string | null } = {};
    if (b.wechat !== undefined) data.wechat = b.wechat || null;
    if (b.telegram !== undefined) data.telegram = b.telegram || null;
    return userView(await this.prisma.user.update({ where: { id: u.id }, data }));
  }

  @Post('password')
  @HttpCode(204)
  async password(
    @CurrentUser() u: User,
    @Body(new ZodPipe(passwordSchema)) b: z.infer<typeof passwordSchema>,
    @Req() req: Request,
  ) {
    if (!(await argon2.verify(u.passwordHash, b.oldPassword)))
      throw new UnauthorizedException('原密码不正确');
    await this.prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await argon2.hash(b.newPassword) },
    });
    // 保留当前会话，其他设备上的登录全部失效
    const current = hashToken(req.cookies?.[SESSION_COOKIE] as string);
    await this.prisma.session.deleteMany({ where: { userId: u.id, tokenHash: { not: current } } });
  }
}
