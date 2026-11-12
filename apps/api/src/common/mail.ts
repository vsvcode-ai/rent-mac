import { Injectable, Logger } from '@nestjs/common';

export abstract class Mailer {
  abstract send(to: string, subject: string, text: string): Promise<void>;
}

/** 开发 / 测试用：只打日志并保存在内存里。生产环境接 SES / Resend。 */
@Injectable()
export class LogMailer extends Mailer {
  readonly outbox: { to: string; subject: string; text: string }[] = [];
  private log = new Logger('Mail');
  async send(to: string, subject: string, text: string) {
    this.outbox.push({ to, subject, text });
    this.log.log(`→ ${to}: ${subject}\n${text}`);
  }
}
