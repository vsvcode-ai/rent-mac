import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { UPLOAD_DIR } from './settings/settings.controller.js';

export function setup(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // 接口响应一律不缓存：里面有会话相关数据、连接凭证明文和后台数据，不能留在浏览器 / 代理 / CDN 的缓存里
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // 二维码等后台上传的图片（生产环境建议由 nginx / 对象存储直接托管）
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      maxAge: '7d',
      index: false,
      setHeaders: (r) => r.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );
}
