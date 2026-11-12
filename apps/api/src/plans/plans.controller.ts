import { Controller, Get } from '@nestjs/common';
import { PlansService } from './plans.service.js';

@Controller('plans')
export class PlansController {
  constructor(private plans: PlansService) {}
  @Get()
  list() {
    return this.plans.list();
  }
}
