import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { Clock } from '../common/clock.js';
import { Kv } from '../common/kv.js';
import { Mailer } from '../common/mail.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_DAYS, hashToken, newToken } from './session.js';

const tooMany = (msg: string) => new HttpException(msg, 429);
export type CodePurpose = 'register' | 'reset';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private kv: Kv,
    private mail: Mailer,
    private clock: Clock,
  ) {}

  async sendCode(email: string, purpose: CodePurpose, ip: string) {
    if ((await this.kv.incr(`code:ip:${ip}`, 3600)) > 20) throw tooMany('请求过于频繁，请稍后再试');
    if (await this.kv.get(`code:cool:${email}`))
      throw tooMany('验证码发送过于频繁，请 60 秒后再试');
    const exists = !!(await this.prisma.user.findUnique({ where: { email } }));
    if (purpose === 'register' && exists) throw new ConflictException('该邮箱已注册，请直接登录');
    await this.kv.set(`code:cool:${email}`, '1', 60);
    // 找回密码：账号不存在时不报错、不发信，避免被用来探测邮箱
    if (purpose === 'reset' && !exists) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.kv.set(`code:${purpose}:${email}`, code, 600);
    await this.kv.del(`code:fail:${purpose}:${email}`);
    await this.mail.send(
      email,
      `南洋桌面验证码：${code}`,
      `你的验证码是 ${code}，10 分钟内有效。如非本人操作请忽略。`,
    );
  }

  private async checkCode(email: string, purpose: CodePurpose, code: string) {
    const stored = await this.kv.get(`code:${purpose}:${email}`);
    if (!stored) throw new BadRequestException('验证码已过期，请重新获取');
    if (stored !== code) {
      // 错 5 次即作废，防暴力枚举 6 位码
      if ((await this.kv.incr(`code:fail:${purpose}:${email}`, 600)) >= 5)
        await this.kv.del(`code:${purpose}:${email}`);
      throw new BadRequestException('验证码不正确');
    }
    await this.kv.del(`code:${purpose}:${email}`);
  }

  async register(email: string, code: string, password: string) {
    await this.checkCode(email, 'register', code);
    const passwordHash = await argon2.hash(password);
    try {
      return await this.prisma.user.create({ data: { email, passwordHash, emailVerified: true } });
    } catch {
      throw new ConflictException('该邮箱已注册，请直接登录');
    }
  }

  async login(email: string, password: string, ip: string) {
    const key = `login:fail:${email}:${ip}`;
    if (Number((await this.kv.get(key)) ?? 0) >= 5)
      throw tooMany('登录失败次数过多，请 15 分钟后再试');
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok =
      user && user.status === 'active' && (await argon2.verify(user.passwordHash, password));
    if (!ok) {
      await this.kv.incr(key, 900);
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    await this.kv.del(key);
    return user;
  }

  async resetPassword(email: string, code: string, password: string) {
    await this.checkCode(email, 'reset', code);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('验证码已过期，请重新获取');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(password) },
    });
    // 改密后让所有旧会话失效
    await this.prisma.session.deleteMany({ where: { userId: user.id } });
  }

  async createSession(userId: string, ip?: string, userAgent?: string) {
    const token = newToken();
    const expiresAt = new Date(this.clock.now().getTime() + SESSION_DAYS * 86_400_000);
    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, ip, userAgent },
    });
    return { token, expiresAt };
  }

  async destroySession(token: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
