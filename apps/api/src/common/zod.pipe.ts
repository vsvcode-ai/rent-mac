import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodTypeAny) {}
  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: r.error.issues[0]?.message ?? '参数错误',
        issues: r.error.issues,
      });
    }
    return r.data;
  }
}
