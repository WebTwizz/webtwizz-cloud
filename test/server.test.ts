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

describe('signed-in requests', () => {
  it('reach the sign-in service under its own cookie names when Next proxies the request', async () => {
    process.env.WEBTWIZZ_AUTH_URL = 'https://auth.example.com/app/auth';
    process.env.WEBTWIZZ_AUTH_SECRET = 'x'.repeat(40);
    const seen: Array<{ path: string; method: string; cookie: string | null; body: string }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      seen.push({ path: new URL(request.url).pathname, method: request.method, cookie: request.headers.get('cookie'), body: await request.text() });
      return new Response('{"success":true}', { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const nextProxy = (request: Request) => new Proxy(request, {
      get: (target, key) => {
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      const { GET, POST } = createAuth().handler();
      const cookie = '__Secure-webtwizz-auth.session_token=abc; theme=dark';
      const signOut = await POST(
        nextProxy(new Request('https://site.example.com/api/auth/sign-out', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.example.com', cookie }, body: '{}' })),
        { params: Promise.resolve({ path: ['sign-out'] }) },
      );
      expect(signOut.status).toBe(200);
      const session = await GET(
        nextProxy(new Request('https://site.example.com/api/auth/get-session', { headers: { origin: 'https://site.example.com', cookie } })),
        { params: Promise.resolve({ path: ['get-session'] }) },
      );
      expect(session.status).toBe(200);
      expect(seen.find((call) => call.path.endsWith('/sign-out'))).toMatchObject({ method: 'POST', cookie: expect.stringContaining('__Secure-neon-auth.session_token=abc'), body: '{}' });
      expect(seen.find((call) => call.path.endsWith('/get-session'))?.cookie).toContain('__Secure-neon-auth.session_token=abc');
      expect(seen.every((call) => !call.cookie?.includes('__Secure-webtwizz-auth.'))).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('sign-up code', () => {
  it('asks for the code after a sign-up that needs confirming, and only then', async () => {
    process.env.WEBTWIZZ_AUTH_URL = 'https://auth.example.com/app/auth';
    process.env.WEBTWIZZ_AUTH_SECRET = 'x'.repeat(40);
    const sent: Array<{ url: string; body: string; origin: string | null }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/email-otp/send-verification-otp')) {
        sent.push({ url, body: String(init?.body), origin: new Headers(init?.headers).get('origin') });
        return new Response('{"success":true}');
      }
      const path = new URL(url).pathname;
      const verified = path.endsWith('/sign-in/email');
      return new Response(JSON.stringify({ token: verified ? 't' : null, user: { email: 'new@example.com', emailVerified: verified } }), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const { POST } = createAuth().handler();
      const post = (path: string) => POST(
        new Request(`https://site.example.com/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site.example.com' }, body: '{"email":"new@example.com","password":"x"}' }),
        { params: Promise.resolve({ path: path.split('/') }) },
      );
      await post('sign-up/email');
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe('https://auth.example.com/app/auth/email-otp/send-verification-otp');
      expect(JSON.parse(sent[0].body)).toEqual({ email: 'new@example.com', type: 'email-verification' });
      expect(sent[0].origin).toBe('https://site.example.com');
      await post('sign-in/email');
      expect(sent).toHaveLength(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
