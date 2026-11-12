import { Injectable } from '@nestjs/common';
import { ACTIVATION_DEADLINE_DAYS, GRACE_DAYS, PENDING_EXPIRE_HOURS } from '@nyd/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export const SETTING_DEFAULTS = {
  'support.wechat': '',
  'support.telegram': '',
  'support.wechatQr': '',
  'activation.deadlineDays': ACTIVATION_DEADLINE_DAYS,
  'lease.graceDays': GRACE_DAYS,
  'order.pendingExpireHours': PENDING_EXPIRE_HOURS,
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    const rows = await this.prisma.setting.findMany();
    const m = new Map(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(
      Object.entries(SETTING_DEFAULTS).map(([k, d]) => [k, m.has(k) ? m.get(k) : d]),
    ) as Record<SettingKey, string | number>;
  }
  async number(
    key: 'activation.deadlineDays' | 'lease.graceDays' | 'order.pendingExpireHours',
  ): Promise<number> {
    const r = await this.prisma.setting.findUnique({ where: { key } });
    return typeof r?.value === 'number' ? r.value : (SETTING_DEFAULTS[key] as number);
  }
  async set(entries: Partial<Record<SettingKey, string | number>>) {
    for (const [key, value] of Object.entries(entries)) {
      await this.prisma.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: { value: value as Prisma.InputJsonValue },
      });
    }
  }
}
