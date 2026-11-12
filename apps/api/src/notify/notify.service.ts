import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { Mailer } from '../common/mail.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** 通知渠道：邮件 + 站内信。邮件发送失败不影响业务流程，只记日志。 */
@Injectable()
export class NotifyService {
  private log = new Logger('Notify');
  constructor(
    private prisma: PrismaService,
    private mail: Mailer,
    private clock: Clock,
  ) {}

  async notify(
    userId: string,
    template: string,
    subject: string,
    text: string,
    extra: Record<string, unknown> = {},
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const payload = { subject, text, ...extra };
    await this.prisma.notification.create({
      data: { userId, channel: 'site', template, payload, sentAt: this.clock.now() },
    });
    try {
      await this.mail.send(user.email, subject, text);
      await this.prisma.notification.create({
        data: { userId, channel: 'email', template, payload, sentAt: this.clock.now() },
      });
    } catch (e) {
      this.log.error(`邮件发送失败 ${user.email}: ${String(e)}`);
    }
  }
}
