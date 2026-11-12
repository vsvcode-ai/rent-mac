import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { AdminUser } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  ADMIN_COOKIE,
  AdminGuard,
  AllowPending,
  CurrentAdmin,
  Public,
  Roles,
  type AdminRequest,
} from './admin.guard.js';
import { AdminAuthService } from './admin-auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
const codeSchema = z
  .object({ code: z.string().optional(), recoveryCode: z.string().optional() })
  .refine((v) => v.code || v.recoveryCode, { message: '请输入动态码或恢复码' });
const enableSchema = z.object({ code: z.string() });

export const adminView = (a: AdminUser) => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role,
  totpEnabled: !!a.totpEnabledAt,
});

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminAuthController {
  constructor(private svc: AdminAuthService) {}

  private setCookie(res: Response, token: string, expires: Date) {
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      expires,
      path: '/',
    });
  }

  @Post('auth/login')
  @HttpCode(200)
  @Public()
  async login(
    @Body(new ZodPipe(loginSchema)) b: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.svc.login(b.email, b.password, req.ip ?? '');
    this.setCookie(res, r.token, r.expiresAt);
    return { stage: r.stage };
  }

  @Get('auth/totp/setup')
  @AllowPending()
  setup(@CurrentAdmin() a: AdminUser) {
    return this.svc.beginSetup(a.id, a.email);
  }

  @Post('auth/totp/enable')
  @HttpCode(200)
  @AllowPending()
  async enable(
    @CurrentAdmin() a: AdminUser,
    @Body(new ZodPipe(enableSchema)) b: { code: string },
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.svc.enable(a.id, req.adminSessionId, b.code, req.ip ?? '');
    const token = req.cookies[ADMIN_COOKIE] as string;
    this.setCookie(res, token, r.expiresAt);
    return { recoveryCodes: r.recoveryCodes };
  }

  @Post('auth/totp/verify')
  @HttpCode(200)
  @AllowPending()
  async verify(
    @CurrentAdmin() a: AdminUser,
    @Body(new ZodPipe(codeSchema)) b: { code?: string; recoveryCode?: string },
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.svc.verify(a.id, req.adminSessionId, b, req.ip ?? '');
    this.setCookie(res, req.cookies[ADMIN_COOKIE] as string, r.expiresAt);
    return adminView(a);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @AllowPending()
  async logout(@Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) {
    await this.svc.logout(req.adminSessionId);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentAdmin() a: AdminUser) {
    return adminView(a);
  }

  @Post('admins/:id/reset-totp')
  @HttpCode(204)
  @Roles('admin')
  async reset(@CurrentAdmin() a: AdminUser, @Param('id') id: string, @Req() req: Request) {
    await this.svc.resetTotp(a.id, id, req.ip ?? '');
  }
}
