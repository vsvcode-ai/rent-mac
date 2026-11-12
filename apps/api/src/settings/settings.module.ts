import { Global, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Global()
@Module({
  imports: [AdminModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
