import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export function setup(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
