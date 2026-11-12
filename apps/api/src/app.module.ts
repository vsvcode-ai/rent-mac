import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CoreModule } from './prisma/prisma.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PlansModule } from './plans/plans.module.js';

@Module({ imports: [CoreModule, AuthModule, PlansModule, OrdersModule] })
export class AppModule {}
