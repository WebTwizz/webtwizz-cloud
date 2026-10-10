import { afterEach, describe, expect, it } from 'vitest';
import { createAuth } from '../src/server';

afterEach(() => {
  delete process.env.WEBTWIZZ_AUTH_URL;
  delete process.env.WEBTWIZZ_AUTH_SECRET;
});

describe('createAuth', () => {
  it('reads the site settings', () => {
    process.env.WEBTWIZZ_AUTH_URL = 'https://auth.example.com/app/auth';
    process.env.WEBTWIZZ_AUTH_SECRET = 'x'.repeat(40);
    const auth = createAuth();
    expect(typeof auth.handler().POST).toBe('function');
    expect(typeof auth.middleware({ loginUrl: '/sign-in' })).toBe('function');
    expect(typeof auth.getSession).toBe('function');
  });

  it('says which setting is missing', () => {
    expect(() => createAuth()).toThrow(/WEBTWIZZ_AUTH_URL is not set/);
    process.env.WEBTWIZZ_AUTH_URL = 'https://auth.example.com/app/auth';
    expect(() => createAuth()).toThrow(/WEBTWIZZ_AUTH_SECRET is not set/);
  });
});
