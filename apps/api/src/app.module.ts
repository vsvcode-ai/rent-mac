import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CoreModule } from './prisma/prisma.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { AdminModule } from './admin/admin.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { ConsultModule } from './consult/consult.module.js';
import { LifecycleModule } from './lifecycle/lifecycle.module.js';
import { MeModule } from './me/me.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { LeasesModule } from './leases/leases.module.js';
import { NotifyModule } from './notify/notify.module.js';
import { PlansModule } from './plans/plans.module.js';

@Module({
  imports: [
    CoreModule,
    AuthModule,
    PlansModule,
    OrdersModule,
    AdminModule,
    NotifyModule,
    LeasesModule,
    DevicesModule,
    SettingsModule,
    LifecycleModule,
    MeModule,
    TicketsModule,
    ConsultModule,
  ],
})
export class AppModule {}
