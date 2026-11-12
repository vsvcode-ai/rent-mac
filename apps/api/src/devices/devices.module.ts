import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { DevicesController, HeartbeatController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [AdminModule],
  controllers: [DevicesController, HeartbeatController],
  providers: [DevicesService],
})
export class DevicesModule {}
