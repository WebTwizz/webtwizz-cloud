import { createAuthClient as create } from '@neondatabase/auth/next';

export type AuthClient = ReturnType<typeof create>;

export function createAuthClient(): AuthClient {
  return create();
}
