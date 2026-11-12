import { Injectable } from '@nestjs/common';
import { Clock } from './clock.js';

/** 验证码、限流用的键值存储。生产换成 Redis 实现，接口不变。 */
export abstract class Kv {
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string, ttlSec: number): Promise<void>;
  /** 自增，首次创建时设置过期时间，返回自增后的值 */
  abstract incr(key: string, ttlSec: number): Promise<number>;
  abstract del(key: string): Promise<void>;
}

@Injectable()
export class MemoryKv extends Kv {
  private m = new Map<string, { v: string; exp: number }>();
  constructor(private clock: Clock) {
    super();
  }
  private live(key: string) {
    const e = this.m.get(key);
    if (!e) return null;
    if (e.exp <= this.clock.now().getTime()) {
      this.m.delete(key);
      return null;
    }
    return e;
  }
  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.m.set(key, { v: value, exp: this.clock.now().getTime() + ttlSec * 1000 });
  }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.m.set(key, { v: String(n), exp: e ? e.exp : this.clock.now().getTime() + ttlSec * 1000 });
    return n;
  }
  async del(key: string) {
    this.m.delete(key);
  }
}
