import { PrismaClient } from '@prisma/client';
import { DEFAULT_PLANS } from '@nyd/shared';

const prisma = new PrismaClient();

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

async function main() {
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { term: p.term },
      update: {},
      create: {
        term: p.term,
        months: p.months,
        monthlyCents: p.monthlyCents,
        dedicatedSupport: p.dedicatedSupport,
      },
    });
  }

  // 200 台示例机器（真实台账上线前用 Excel 批量导入覆盖）
  for (let i = 1; i <= 200; i++) {
    const code = `NYD-MY-${pad(i, 4)}`;
    await prisma.device.upsert({
      where: { code },
      update: {},
      create: {
        code,
        serial: `SEED${pad(i, 6)}`,
        rackLocation: `R${pad(Math.floor((i - 1) / 20) + 1)}-${pad(((i - 1) % 20) + 1)}`,
        publicIp: `10.200.${Math.floor((i - 1) / 250)}.${((i - 1) % 250) + 1}`,
      },
    });
  }

  const defaults: Record<string, unknown> = {
    'support.wechat': '',
    'support.telegram': '',
    'activation.deadlineDays': 7,
    'lease.graceDays': 3,
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }
  console.log('seed done');
}

main().finally(() => prisma.$disconnect());
