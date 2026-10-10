import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';
import { env } from './env';

export type AuthOptions = {
  url?: string;
  secret?: string;
  sessionDataTtl?: number;
};

export type Auth = ReturnType<typeof createNeonAuth>;

export function createAuth(options: AuthOptions = {}): Auth {
  return createNeonAuth({
    baseUrl: options.url ?? env('WEBTWIZZ_AUTH_URL'),
    cookies: {
      secret: options.secret ?? env('WEBTWIZZ_AUTH_SECRET'),
      sessionDataTtl: options.sessionDataTtl,
    },
  });
}
