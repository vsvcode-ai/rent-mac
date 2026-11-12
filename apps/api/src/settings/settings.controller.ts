import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TERMS } from '@nyd/shared';
import type { AdminUser } from '@prisma/client';
import type { Request } from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { AdminGuard, CurrentAdmin, Roles } from '../admin/admin.guard.js';
import { AuditService } from '../admin/audit.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from './settings.service.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');

const urlOrEmpty = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^https?:\/\//.test(v) || v.startsWith('/uploads/'),
    '链接必须以 http(s):// 开头',
  );
const updateSchema = z.object({
  plans: z
    .array(
      z.object({
        term: z.enum(TERMS),
        monthlyCents: z.number().int().min(100).max(1_000_000),
        xianyuUrl: urlOrEmpty.optional(),
        xianyuQrImage: urlOrEmpty.optional(),
      }),
    )
    .optional(),
  support: z
    .object({
      wechat: z.string().trim().max(64),
      telegram: z.string().trim().max(64),
      wechatQr: urlOrEmpty,
    })
    .partial()
    .optional(),
  activationDeadlineDays: z.number().int().min(1).max(30).optional(),
  graceDays: z.number().int().min(0).max(30).optional(),
  pendingExpireHours: z.number().int().min(1).max(240).optional(),
});

/** 只认 PNG / JPEG / WebP，按文件头判断而不是信任扩展名和 Content-Type */
function sniff(buf: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP')
    return 'webp';
  return null;
}

@Controller()
export class SettingsController {
  constructor(
    private settings: SettingsService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** 前台客服浮窗用，不含敏感配置 */
  @Get('settings/public')
  async publicSettings() {
    const s = await this.settings.getAll();
    return {
      supportWechat: s['support.wechat'],
      supportTelegram: s['support.telegram'],
      supportWechatQr: s['support.wechatQr'],
    };
  }

  @Get('admin/settings')
  @UseGuards(AdminGuard)
  async get() {
    const [s, plans] = await Promise.all([
      this.settings.getAll(),
      this.prisma.plan.findMany({ orderBy: { months: 'asc' } }),
    ]);
    return { settings: s, plans };
  }

  @Put('admin/settings')
  @UseGuards(AdminGuard)
  @Roles('admin')
  async update(
    @CurrentAdmin() a: AdminUser,
    @Body(new ZodPipe(updateSchema)) b: z.infer<typeof updateSchema>,
    @Req() req: Request,
  ) {
    const changes: Record<string, unknown> = {};
    const needXianyuSync: { term: string; oldCents: number; newCents: number }[] = [];
    for (const p of b.plans ?? []) {
      const old = await this.prisma.plan.findUniqueOrThrow({ where: { term: p.term } });
      await this.prisma.plan.update({
        where: { term: p.term },
        data: {
          monthlyCents: p.monthlyCents,
          xianyuUrl: p.xianyuUrl ?? old.xianyuUrl,
          xianyuQrImage: p.xianyuQrImage ?? old.xianyuQrImage,
        },
      });
      if (old.monthlyCents !== p.monthlyCents) {
        await this.prisma.priceChangeLog.create({
          data: {
            term: p.term,
            oldCents: old.monthlyCents,
            newCents: p.monthlyCents,
            adminId: a.id,
          },
        });
        needXianyuSync.push({ term: p.term, oldCents: old.monthlyCents, newCents: p.monthlyCents });
        changes[`price.${p.term}`] = { from: old.monthlyCents, to: p.monthlyCents };
      }
      if (p.xianyuUrl !== undefined && p.xianyuUrl !== old.xianyuUrl)
        changes[`xianyuUrl.${p.term}`] = p.xianyuUrl;
    }
    const entries = {
      ...(b.support?.wechat !== undefined && { 'support.wechat': b.support.wechat }),
      ...(b.support?.telegram !== undefined && { 'support.telegram': b.support.telegram }),
      ...(b.support?.wechatQr !== undefined && { 'support.wechatQr': b.support.wechatQr }),
      ...(b.activationDeadlineDays !== undefined && {
        'activation.deadlineDays': b.activationDeadlineDays,
      }),
      ...(b.graceDays !== undefined && { 'lease.graceDays': b.graceDays }),
      ...(b.pendingExpireHours !== undefined && {
        'order.pendingExpireHours': b.pendingExpireHours,
      }),
    };
    await this.settings.set(entries);
    Object.assign(changes, entries);
    await this.audit.log(a.id, 'settings.update', 'settings', changes as never, req.ip);
    // 只对新订单生效；闲鱼商品价格需要运营手动同步
    return { ok: true, needXianyuSync };
  }

  @Post('admin/uploads')
  @UseGuards(AdminGuard)
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAdmin() a: AdminUser,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('请选择图片');
    const ext = sniff(file.buffer);
    if (!ext) throw new BadRequestException('只支持 PNG / JPG / WebP 图片');
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    writeFileSync(join(UPLOAD_DIR, name), file.buffer);
    await this.audit.log(a.id, 'upload.image', `file:${name}`, { size: file.size }, req.ip);
    return { url: `/uploads/${name}` };
  }
}
