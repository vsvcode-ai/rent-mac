import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { LifecycleService } from './lifecycle.service.js';

@Module({ imports: [OrdersModule], providers: [LifecycleService], exports: [LifecycleService] })
export class LifecycleModule {}
