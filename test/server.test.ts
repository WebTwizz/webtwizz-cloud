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

describe('forBrowser', () => {
  it('renames the session cookies and drops the sign-in service headers', async () => {
    const { forBrowser } = await import('../src/server');
    const headers = new Headers({ 'content-type': 'application/json', 'x-neon-ret-request-id': 'abc' });
    headers.append('set-cookie', '__Secure-neon-auth.session_token=1; Path=/; HttpOnly; Secure');
    headers.append('set-cookie', '__Secure-neon-auth.local.session_data=2; Path=/');
    const response = forBrowser(new Response('{}', { status: 201, headers }));
    expect(response.status).toBe(201);
    expect(response.headers.get('x-neon-ret-request-id')).toBeNull();
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.getSetCookie()).toEqual(['__Secure-webtwizz-auth.session_token=1; Path=/; HttpOnly; Secure', '__Secure-webtwizz-auth.local.session_data=2; Path=/']);
    expect(await response.text()).toBe('{}');
  });

  it('copies a response whose headers are locked', async () => {
    const { forBrowser } = await import('../src/server');
    const locked = Response.redirect('https://example.com/', 302);
    Object.defineProperty(locked, 'headers', { value: new Proxy(new Headers({ location: 'https://example.com/', 'x-neon-ret-request-id': 'abc' }), { get: (target, key) => (key === 'delete' ? () => { throw new TypeError('immutable'); } : Reflect.get(target, key).bind?.(target) ?? Reflect.get(target, key)) }) });
    const response = forBrowser(locked);
    expect(response.headers.get('x-neon-ret-request-id')).toBeNull();
    expect(response.headers.get('location')).toBe('https://example.com/');
  });
});
