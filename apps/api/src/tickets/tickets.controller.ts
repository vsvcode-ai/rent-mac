import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminUser, User } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminGuard, CurrentAdmin, Roles } from '../admin/admin.guard.js';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TICKET_CATEGORIES, TicketsService } from './tickets.service.js';

const STATUSES = ['open', 'processing', 'resolved', 'closed'] as const;
const createSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  content: z.string().trim().min(5, '请至少写 5 个字').max(2000),
  leaseId: z.string().optional(),
});
const replySchema = z.object({ content: z.string().trim().min(1).max(2000) });
const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  keyword: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  assigneeId: z.string().nullable().optional(),
});
const noteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  internal: z.boolean(),
});

@Controller()
export class TicketsController {
  constructor(private svc: TicketsService) {}

  @Post('tickets')
  @UseGuards(AuthGuard)
  create(@CurrentUser() u: User, @Body(new ZodPipe(createSchema)) b: z.infer<typeof createSchema>) {
    return this.svc.create(u.id, b);
  }

  @Get('me/tickets')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() u: User) {
    return this.svc.mine(u.id);
  }

  @Post('me/tickets/:no/reply')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  reply(
    @CurrentUser() u: User,
    @Param('no') no: string,
    @Body(new ZodPipe(replySchema)) b: { content: string },
  ) {
    return this.svc.reply(u.id, no, b.content);
  }

  @Get('admin/tickets')
  @UseGuards(AdminGuard)
  @Roles('support', 'ops')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.svc.adminList(q);
  }

  @Patch('admin/tickets/:no')
  @UseGuards(AdminGuard)
  @Roles('support', 'ops')
  update(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(updateSchema)) b: z.infer<typeof updateSchema>,
    @Req() req: Request,
  ) {
    return this.svc.adminUpdate(a, no, b, req.ip);
  }

  @Post('admin/tickets/:no/notes')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @Roles('support', 'ops')
  note(
    @CurrentAdmin() a: AdminUser,
    @Param('no') no: string,
    @Body(new ZodPipe(noteSchema)) b: z.infer<typeof noteSchema>,
    @Req() req: Request,
  ) {
    return this.svc.adminNote(a, no, b, req.ip);
  }

  @Get('admin/staff')
  @UseGuards(AdminGuard)
  staff() {
    return this.svc.staff();
  }
}
