import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import { UPLOAD_DIR } from './settings/settings.controller.js';

export function setup(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
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
