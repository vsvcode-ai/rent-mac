import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'nyd_session';
export const SESSION_DAYS = 30;
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
