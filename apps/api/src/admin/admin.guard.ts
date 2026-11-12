import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole, AdminUser } from '@prisma/client';
import type { Request } from 'express';
import { hashToken } from '../auth/session.js';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ADMIN_COOKIE = 'nyd_admin';
export type AdminRequest = Request & {
  admin: AdminUser;
  adminSessionId: string;
  adminVerified: boolean;
};

/** 允许「密码已通过、两步验证未完成」的会话访问（仅两步验证相关接口使用） */
export const AllowPending = () => SetMetadata('allowPending', true);
/** 无需登录的接口（仅后台登录） */
export const Public = () => SetMetadata('public', true);
/** 限定角色；admin 角色拥有所有权限 */
export const Roles = (...roles: AdminRole[]) => SetMetadata('roles', roles);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private clock: Clock,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.get<boolean>('public', ctx.getHandler())) return true;
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const token = req.cookies?.[ADMIN_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('请先登录后台');
    const s = await this.prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!s || s.expiresAt <= this.clock.now()) throw new UnauthorizedException('后台登录已过期');
    const admin = await this.prisma.adminUser.findUnique({ where: { id: s.adminId } });
    if (!admin || admin.status !== 'active') throw new UnauthorizedException('账号不可用');
    if (!s.verified && !this.reflector.get<boolean>('allowPending', ctx.getHandler())) {
      throw new UnauthorizedException('请先完成两步验证');
    }
    const roles = this.reflector.get<AdminRole[] | undefined>('roles', ctx.getHandler());
    if (roles && admin.role !== 'admin' && !roles.includes(admin.role))
      throw new ForbiddenException('没有权限执行该操作');
    Object.assign(req, { admin, adminSessionId: s.id, adminVerified: s.verified });
    return true;
  }
}

export const CurrentAdmin = createParamDecorator(
  (_d, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().admin,
);
