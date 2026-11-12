import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({ imports: [AdminModule], controllers: [DevicesController], providers: [DevicesService] })
export class DevicesModule {}
