import { z } from 'zod';
import { MAX_QTY_PER_ORDER, TERMS } from './constants';

export const termSchema = z.enum(TERMS);

export const createOrderSchema = z
  .object({
    term: termSchema,
    quantity: z.number().int().min(1).max(MAX_QTY_PER_ORDER),
    kind: z.enum(['new', 'renew']).default('new'),
    renewLeaseId: z.string().optional(),
    contactWechat: z.string().trim().max(64).optional(),
    contactTelegram: z.string().trim().max(64).optional(),
    agreedTerms: z.literal(true, { errorMap: () => ({ message: '请先同意相关条款' }) }),
  })
  // 续费单联系方式可不填（缺省用账户资料）
  .refine((v) => v.kind === 'renew' || v.contactWechat || v.contactTelegram, {
    message: '微信和 Telegram 至少填写一个',
    path: ['contactWechat'],
  })
  .refine((v) => v.kind === 'new' || !!v.renewLeaseId, {
    message: '续费单必须指定设备租约',
    path: ['renewLeaseId'],
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const submitXianyuSchema = z.object({
  xianyuOrderNo: z
    .string()
    .trim()
    .regex(/^\d{10,}$/, '闲鱼订单号为 10 位以上数字'),
  xianyuBuyerNick: z.string().trim().min(1, '请填写闲鱼昵称').max(64),
});
export type SubmitXianyuInput = z.infer<typeof submitXianyuSchema>;

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/, '验证码为 6 位数字'),
  password: z.string().min(8, '密码至少 8 位').max(128),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
