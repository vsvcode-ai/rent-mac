import { Global, Module } from '@nestjs/common';
import { NotifyService } from './notify.service.js';

@Global()
@Module({ providers: [NotifyService], exports: [NotifyService] })
export class NotifyModule {}
