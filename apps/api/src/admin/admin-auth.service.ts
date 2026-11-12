import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { hashToken, newToken } from '../auth/session.js';
import { Clock } from '../common/clock.js';
import { Kv } from '../common/kv.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';
import { newSecret, otpauthUrl, stepOf, verifyTotp } from './totp.js';

const PENDING_MIN = 10;
const FULL_HOURS = 12;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const newRecoveryCode = () => {
  const h = randomBytes(5).toString('hex');
  return `${h.slice(0, 5)}-${h.slice(5)}`;
};

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private kv: Kv,
    private clock: Clock,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  async login(email: string, password: string, ip: string) {
    const key = `admin:login:fail:${email}:${ip}`;
    if (Number((await this.kv.get(key)) ?? 0) >= 5)
      throw new HttpException('登录失败次数过多，请 15 分钟后再试', 429);
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const ok =
      admin && admin.status === 'active' && (await argon2.verify(admin.passwordHash, password));
    if (!ok) {
      await this.kv.incr(key, 900);
      throw new UnauthorizedException('邮箱或密码不正确');
    }
    await this.kv.del(key);
    const token = newToken();
    const expiresAt = new Date(this.clock.now().getTime() + PENDING_MIN * 60_000);
    await this.prisma.adminSession.create({
      data: { adminId: admin.id, tokenHash: hashToken(token), verified: false, expiresAt, ip },
    });
    return {
      token,
      expiresAt,
      stage: admin.totpEnabledAt ? ('totp_required' as const) : ('totp_setup' as const),
    };
  }

  private async promote(sessionId: string) {
    const expiresAt = new Date(this.clock.now().getTime() + FULL_HOURS * 3_600_000);
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { verified: true, expiresAt },
    });
    return expiresAt;
  }

  /** 首次登录：生成待确认的密钥。重复调用会换新密钥（用户没扫成功时可重试） */
  async beginSetup(adminId: string, email: string) {
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (a.totpEnabledAt) throw new ConflictException('已绑定两步验证');
    const secret = newSecret();
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecretEnc: this.crypto.encrypt(secret) },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, email) };
  }

  async enable(adminId: string, sessionId: string, code: string, ip: string) {
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (a.totpEnabledAt) throw new ConflictException('已绑定两步验证');
    if (!a.totpSecretEnc) throw new BadRequestException('请先获取绑定二维码');
    const step = verifyTotp(this.crypto.decrypt(a.totpSecretEnc), code, this.clock.now());
    if (step === null) throw new BadRequestException('动态码不正确');
    await this.kv.set(`totp:used:${adminId}:${step}`, '1', 120);
    const recoveryCodes = Array.from({ length: 10 }, newRecoveryCode);
    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { totpEnabledAt: this.clock.now(), recoveryCodeHashes: recoveryCodes.map(sha) },
    });
    const expiresAt = await this.promote(sessionId);
    await this.audit.log(adminId, 'admin.totp.enable', `admin:${adminId}`, undefined, ip);
    return { recoveryCodes, expiresAt };
  }

  async verify(
    adminId: string,
    sessionId: string,
    input: { code?: string; recoveryCode?: string },
    ip: string,
  ) {
    const failKey = `admin:totp:fail:${adminId}`;
    if (Number((await this.kv.get(failKey)) ?? 0) >= 5) {
      await this.prisma.adminSession.delete({ where: { id: sessionId } }).catch(() => undefined);
      throw new HttpException('验证失败次数过多，请重新登录', 429);
    }
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (!a.totpEnabledAt || !a.totpSecretEnc) throw new BadRequestException('尚未绑定两步验证');
    let ok = false;
    if (input.code) {
      const step = verifyTotp(this.crypto.decrypt(a.totpSecretEnc), input.code, this.clock.now());
      // 同一个动态码只能用一次，防重放
      if (step !== null && !(await this.kv.get(`totp:used:${adminId}:${step}`))) {
        await this.kv.set(`totp:used:${adminId}:${step}`, '1', 120);
        ok = true;
      }
    } else if (input.recoveryCode) {
      const hashes = a.recoveryCodeHashes as string[];
      const h = sha(input.recoveryCode.trim().toLowerCase());
      if (hashes.includes(h)) {
        await this.prisma.adminUser.update({
          where: { id: adminId },
          data: { recoveryCodeHashes: hashes.filter((x) => x !== h) },
        });
        await this.audit.log(
          adminId,
          'admin.recovery_code.used',
          `admin:${adminId}`,
          { remaining: hashes.length - 1 },
          ip,
        );
        ok = true;
      }
    }
    if (!ok) {
      await this.kv.incr(failKey, 600);
      throw new UnauthorizedException('动态码不正确');
    }
    await this.kv.del(failKey);
    return { expiresAt: await this.promote(sessionId) };
  }

  async logout(sessionId: string) {
    await this.prisma.adminSession.deleteMany({ where: { id: sessionId } });
  }

  /** 管理员重置他人的两步验证：清除密钥和恢复码，对方下次登录会被强制重新绑定，并踢下线 */
  async resetTotp(operatorId: string, targetId: string, ip: string) {
    const t = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!t) throw new BadRequestException('管理员不存在');
    await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { totpSecretEnc: null, totpEnabledAt: null, recoveryCodeHashes: [] },
    });
    await this.prisma.adminSession.deleteMany({ where: { adminId: targetId } });
    await this.audit.log(
      operatorId,
      'admin.totp.reset',
      `admin:${targetId}`,
      { email: t.email },
      ip,
    );
  }

  stepNow() {
    return stepOf(this.clock.now());
  }
}
