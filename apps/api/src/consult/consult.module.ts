import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { ConsultController, ConsultService } from './consult.controller.js';

@Module({ imports: [AdminModule], controllers: [ConsultController], providers: [ConsultService] })
export class ConsultModule {}
