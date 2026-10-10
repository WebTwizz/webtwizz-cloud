import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../src/db';

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe('db', () => {
  it('connects through the pooler-safe settings', () => {
    process.env.DATABASE_URL = 'postgres://u:p@db.example.com:5432/app';
    const sql = createDb({ max: 3, prepare: true });
    expect(sql.options.prepare).toBe(false);
    expect(sql.options.max).toBe(3);
    expect(sql.options.host).toEqual(['db.example.com']);
  });

  it('says which setting is missing', () => {
    expect(() => createDb()).toThrow(/DATABASE_URL is not set/);
  });
});
