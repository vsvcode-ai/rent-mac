import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { loginSchema, registerSchema } from '@nyd/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuthGuard, CurrentUser } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE } from './session.js';
import type { User } from '@prisma/client';

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email('邮箱格式不正确') });
const resetSchema = registerSchema;

export const userView = (u: User) => ({
  id: u.id,
  email: u.email,
  wechat: u.wechat,
  telegram: u.telegram,
  createdAt: u.createdAt,
});

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  private async startSession(userId: string, req: Request, res: Response) {
    const { token, expiresAt } = await this.auth.createSession(
      userId,
      req.ip,
      req.headers['user-agent'],
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/',
    });
  }

  @Post('auth/send-code')
  @HttpCode(204)
  async sendCode(@Body(new ZodPipe(emailSchema)) b: { email: string }, @Req() req: Request) {
    await this.auth.sendCode(b.email, 'register', req.ip ?? '');
  }

  @Post('auth/forgot-password')
  @HttpCode(204)
  async forgot(@Body(new ZodPipe(emailSchema)) b: { email: string }, @Req() req: Request) {
    await this.auth.sendCode(b.email, 'reset', req.ip ?? '');
  }

  @Post('auth/register')
  async register(
    @Body(new ZodPipe(registerSchema)) b: z.infer<typeof registerSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.register(b.email, b.code, b.password);
    await this.startSession(user.id, req, res);
    return userView(user);
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) b: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.login(b.email, b.password, req.ip ?? '');
    await this.startSession(user.id, req, res);
    return userView(user);
  }

  @Post('auth/reset-password')
  @HttpCode(204)
  async reset(@Body(new ZodPipe(resetSchema)) b: z.infer<typeof resetSchema>) {
    await this.auth.resetPassword(b.email, b.code, b.password);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) await this.auth.destroySession(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() u: User) {
    return userView(u);
  }
}
