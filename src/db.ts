import 'server-only';
import postgres from 'postgres';
import { env } from './env';

export type DbOptions = postgres.Options<Record<string, postgres.PostgresType>> & { url?: string };

export type Db = postgres.Sql<Record<string, never>>;

export function createDb({ url, ...options }: DbOptions = {}): Db {
  return postgres(url ?? env('DATABASE_URL'), { ...options, prepare: false });
}
