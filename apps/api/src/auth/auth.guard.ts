import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_COOKIE, hashToken } from './session.js';

export type AuthedRequest = Request & { user: User };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('请先登录');
    const s = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!s || s.expiresAt <= this.clock.now()) throw new UnauthorizedException('登录已过期');
    const user = await this.prisma.user.findUnique({ where: { id: s.userId } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('账号不可用');
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
