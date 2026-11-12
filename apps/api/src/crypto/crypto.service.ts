import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM。密文格式：v1.<iv>.<tag>.<data>（base64url）。
 * 版本前缀为以后换密钥 / 重新加密留出空间。
 */
@Injectable()
export class CryptoService {
  private key: Buffer;
  constructor() {
    const raw = process.env.CREDENTIAL_KEY;
    if (!raw && process.env.NODE_ENV === 'production')
      throw new Error('生产环境必须设置 CREDENTIAL_KEY');
    // 开发 / 测试用固定密钥；生产：openssl rand -base64 32
    this.key = Buffer.from(raw ?? 'bnlkLWRldi1vbmx5LWtleS0wMTIzNDU2Nzg5YWJjZGU=', 'base64');
    if (this.key.length !== 32) throw new Error('CREDENTIAL_KEY 必须是 32 字节的 base64');
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv, c.getAuthTag(), data]
      .map((x) => (typeof x === 'string' ? x : x.toString('base64url')))
      .join('.');
  }
  decrypt(blob: string): string {
    const [v, iv, tag, data] = blob.split('.');
    if (v !== 'v1' || !iv || !tag || !data) throw new Error('密文格式不正确');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  }
}
