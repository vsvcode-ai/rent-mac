import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LeasesController } from './leases.controller.js';
import { LeasesService } from './leases.service.js';

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [LeasesController],
  providers: [LeasesService],
})
export class LeasesModule {}
