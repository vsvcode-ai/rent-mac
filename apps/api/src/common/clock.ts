import { Injectable } from '@nestjs/common';

/** 可注入时钟：测试里拨快时间以验证 48 小时取消等逻辑 */
@Injectable()
export class Clock {
  private offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
  advance(ms: number) {
    this.offsetMs += ms;
  }
}
