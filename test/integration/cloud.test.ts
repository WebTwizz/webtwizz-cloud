import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authMessage } from '../../dist/index.js';

const API = 'https://console.neon.tech/api/v2';
const key = process.env.NEON_API_KEY;
const ORIGIN = 'http://localhost:3000';

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(API + path, {
      method,
      headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 423 && attempt < 20) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    if (!response.ok) throw new Error(`${method} ${path} ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return (response.status === 204 ? {} : await response.json()) as T;
  }
}

function pooled(uri: string): string {
  const url = new URL(uri);
  const [endpoint, ...rest] = url.hostname.split('.');
  url.hostname = [`${endpoint}-pooler`, ...rest].join('.');
  return url.toString();
}

if (!key && process.env.CI) throw new Error('NEON_API_KEY is missing, so CI would pass without testing anything.');

describe.skipIf(!key)('WebTwizz Cloud against a throwaway project', () => {
  let projectId = '';
  let branchId = '';
  let storage = false;

  beforeAll(async () => {
    const created = await api('POST', '/projects', {
      project: {
        name: `webtwizz-cloud-ci-${Date.now()}`,
        pg_version: 17,
        branch: { role_name: 'webtwizz', database_name: 'app' },
      },
    });
    projectId = created.project.id;
    branchId = created.branch.id;
    process.env.DATABASE_URL = pooled(created.connection_uris[0].connection_uri);

    const auth = await api('POST', `/projects/${projectId}/branches/${branchId}/auth`, { auth_provider: 'better_auth' });
    process.env.WEBTWIZZ_AUTH_URL = auth.base_url;
    process.env.WEBTWIZZ_AUTH_SECRET = crypto.randomUUID() + crypto.randomUUID();
    await api('POST', `/projects/${projectId}/branches/${branchId}/auth/domains`, { domain: ORIGIN, auth_provider: 'better_auth' }).catch(() => {});

    const state = await api('GET', `/projects/${projectId}/branches/${branchId}/storage`).catch(() => ({ enabled: false }));
    if (state.enabled && state.s3_endpoint) {
      await api('POST', `/projects/${projectId}/branches/${branchId}/buckets`, { name: 'public', access_level: 'public_read' });
      await api('POST', `/projects/${projectId}/branches/${branchId}/buckets`, { name: 'private', access_level: 'private' });
      const write = await api('POST', `/projects/${projectId}/branches/${branchId}/credentials`, { scopes: ['storage:read', 'storage:write'], principal_type: 'user', name: 'ci-write' });
      const read = await api('POST', `/projects/${projectId}/branches/${branchId}/credentials`, { scopes: ['storage:read'], principal_type: 'user', name: 'ci-read' });
      Object.assign(process.env, {
        WEBTWIZZ_STORAGE_ENDPOINT: state.s3_endpoint,
        WEBTWIZZ_STORAGE_REGION: state.s3_region || 'us-east-1',
        WEBTWIZZ_STORAGE_KEY: write.token_id,
        WEBTWIZZ_STORAGE_SECRET: write.s3_secret_access_key,
        WEBTWIZZ_STORAGE_READ_KEY: read.token_id,
        WEBTWIZZ_STORAGE_READ_SECRET: read.s3_secret_access_key,
        WEBTWIZZ_STORAGE_MAX_FILE_MB: '1',
      });
      storage = true;
    }
  });

  afterAll(async () => {
    if (projectId) await api('DELETE', `/projects/${projectId}`);
  });

  it('queries through the pooler, the same statement twice and after a table change', async () => {
    const { createDb } = await import('../../dist/db.js');
    const sql = createDb();
    await sql`create table notes (id serial primary key, user_id uuid not null, body text not null)`;
    const userId = crypto.randomUUID();
    await sql`insert into notes ${sql({ user_id: userId, body: 'first' })}`;
    expect(await sql`select body from notes where user_id = ${userId}`).toEqual([{ body: 'first' }]);
    await sql`alter table notes add column done boolean not null default false`;
    expect(await sql`select body, done from notes where user_id = ${userId}`).toEqual([{ body: 'first', done: false }]);
    await sql.end();
  });

  it('signs up, then words the errors a visitor can cause', async () => {
    const { createAuth } = await import('../../dist/server.js');
    const { GET, POST } = createAuth().handler();
    const call = async (path: string, body?: unknown, cookie = '') => {
      const method = body === undefined ? GET : POST;
      const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN };
      if (cookie) headers.cookie = cookie;
      const response = await method(
        new Request(`${ORIGIN}/api/auth/${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }),
        { params: Promise.resolve({ path: path.split('/') }) },
      );
      const json = await response.json().catch(() => ({}));
      return { status: response.status, json, headerNames: [...response.headers.keys()], cookies: response.headers.getSetCookie() };
    };
    const email = `ci-${Date.now()}@example.com`;

    const signUp = await call('sign-up/email', { email, password: 'correct horse battery', name: 'CI' });
    expect(signUp.status, JSON.stringify(signUp.json)).toBe(200);
    expect(signUp.headerNames.filter((name) => /neon/i.test(name))).toEqual([]);
    expect(signUp.cookies.length).toBeGreaterThan(0);
    for (const cookie of signUp.cookies) expect(cookie).toMatch(/^__Secure-webtwizz-auth\./);

    const jar = signUp.cookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const session = await call('get-session', undefined, jar);
    expect(session.json?.user?.email).toBe(email);
    expect(session.headerNames.filter((name) => /neon/i.test(name))).toEqual([]);

    const again = await call('sign-up/email', { email, password: 'correct horse battery', name: 'CI' });
    expect(authMessage({ ...again.json, status: again.status })).toBe("There's already an account with that email.");

    const wrong = await call('sign-in/email', { email, password: 'not the password' });
    expect(authMessage({ ...wrong.json, status: wrong.status })).toBe("That email or password doesn't match.");

    const short = await call('sign-up/email', { email: `short-${email}`, password: 'abc', name: 'CI' });
    expect(authMessage({ ...short.json, status: short.status })).toBe('Use at least 8 characters for the password.');
  });

  it('keeps a visitor signed in across a real Next app: route handler, server component and proxy', async (context) => {
    if (!existsSync('test/fixture/.next/BUILD_ID')) context.skip();
    const port = 3100;
    const app: ChildProcess = spawn('npx', ['next', 'start', '-p', String(port)], { cwd: 'test/fixture', env: process.env, stdio: 'ignore' });
    try {
      const base = `http://localhost:${port}`;
      for (let i = 0; i < 60; i++) {
        if (await fetch(`${base}/api/me`).then(() => true, () => false)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await api('POST', `/projects/${projectId}/branches/${branchId}/auth/domains`, { domain: base, auth_provider: 'better_auth' }).catch(() => {});
      const email = `next-${Date.now()}@example.com`;
      const signUp = await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email, password: 'correct horse battery', name: 'CI' }) });
      expect(signUp.status).toBe(200);
      expect([...signUp.headers.keys()].filter((name) => /neon/i.test(name))).toEqual([]);
      const cookies = signUp.headers.getSetCookie();
      expect(cookies.every((cookie) => cookie.startsWith('__Secure-webtwizz-auth.'))).toBe(true);
      const jar = cookies.map((cookie) => cookie.split(';')[0]).join('; ');

      expect(await (await fetch(`${base}/api/me`, { headers: { cookie: jar } })).json()).toEqual({ email });
      expect(await (await fetch(`${base}/api/me`)).json()).toEqual({ email: null });

      const page = await fetch(`${base}/account`, { headers: { cookie: jar }, redirect: 'manual' });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain(email);
      expect((await fetch(`${base}/account`, { redirect: 'manual' })).status).toBe(307);
    } finally {
      app.kill();
    }
  });

  it('uploads through a signed link that holds the size, and reads it back', async (context) => {
    if (!storage) context.skip();
    const { createFiles } = await import('../../dist/files.js');
    const files = createFiles();
    const body = new TextEncoder().encode('hello from ci');

    const pub = await files.uploadUrl({ bucket: 'public', name: 'hello.txt', type: 'text/plain', size: body.length });
    expect((await fetch(pub.url, { method: 'PUT', headers: pub.headers, body })).status).toBe(200);
    expect(await (await fetch(files.publicUrl(pub.key))).text()).toBe('hello from ci');

    const lying = await files.uploadUrl({ bucket: 'public', name: 'hello.txt', type: 'text/plain', size: 3 });
    expect((await fetch(lying.url, { method: 'PUT', headers: lying.headers, body })).ok).toBe(false);

    const priv = await files.uploadUrl({ bucket: 'private', name: 'secret.txt', type: 'text/plain', size: body.length });
    expect((await fetch(priv.url, { method: 'PUT', headers: priv.headers, body })).status).toBe(200);
    expect((await fetch(files.publicUrl(priv.key).replace('/public/', '/private/'))).ok).toBe(false);
    expect(await (await fetch(await files.privateUrl(priv.key))).text()).toBe('hello from ci');

    await files.remove('private', priv.key);
    expect((await fetch(await files.privateUrl(priv.key))).ok).toBe(false);
  });
});
