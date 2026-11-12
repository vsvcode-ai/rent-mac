import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  createOrderSchema,
  submitXianyuSchema,
  type CreateOrderInput,
  type SubmitXianyuInput,
} from '@nyd/shared';
import type { User } from '@prisma/client';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrdersService } from './orders.service.js';

@Controller()
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post('orders')
  create(@CurrentUser() u: User, @Body(new ZodPipe(createOrderSchema)) b: CreateOrderInput) {
    return this.orders.create(u.id, b);
  }
  @Get('orders/:no')
  get(@CurrentUser() u: User, @Param('no') no: string) {
    return this.orders.get(u.id, no);
  }
  @Post('orders/:no/xianyu')
  @HttpCode(200)
  xianyu(
    @CurrentUser() u: User,
    @Param('no') no: string,
    @Body(new ZodPipe(submitXianyuSchema)) b: SubmitXianyuInput,
  ) {
    return this.orders.submitXianyu(u.id, no, b);
  }
  @Post('orders/:no/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: User, @Param('no') no: string) {
    return this.orders.cancel(u.id, no);
  }
  @Get('me/orders')
  mine(@CurrentUser() u: User) {
    return this.orders.list(u.id);
  }
}
