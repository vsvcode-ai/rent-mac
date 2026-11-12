import { Module } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { PlansModule } from '../plans/plans.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { AdminGuard } from './admin.guard.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [PlansModule],
  controllers: [AdminAuthController, AdminOrdersController, AuditController],
  providers: [AdminAuthService, AdminOrdersService, AdminGuard, AuditService, CryptoService],
  exports: [AdminGuard, AuditService, CryptoService],
})
export class AdminModule {}
