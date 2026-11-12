import { Global, Module } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { Kv, MemoryKv } from '../common/kv.js';
import { LogMailer, Mailer } from '../common/mail.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    Clock,
    { provide: Kv, useClass: MemoryKv },
    { provide: Mailer, useClass: LogMailer },
  ],
  exports: [PrismaService, Clock, Kv, Mailer],
})
export class CoreModule {}
