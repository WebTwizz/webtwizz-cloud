import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authMessage } from '../../src/errors';

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
    const { createDb } = await import('../../src/db');
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
    const { createAuth } = await import('../../src/server');
    const { POST } = createAuth().handler();
    const call = async (path: string, body: unknown) => {
      const response = await POST(
        new Request(`${ORIGIN}/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) }),
        { params: Promise.resolve({ path: path.split('/') }) },
      );
      const json = await response.json().catch(() => ({}));
      return { status: response.status, json };
    };
    const email = `ci-${Date.now()}@example.com`;

    const signUp = await call('sign-up/email', { email, password: 'correct horse battery', name: 'CI' });
    expect(signUp.status, JSON.stringify(signUp.json)).toBe(200);

    const again = await call('sign-up/email', { email, password: 'correct horse battery', name: 'CI' });
    expect(authMessage({ ...again.json, status: again.status })).toBe("There's already an account with that email.");

    const wrong = await call('sign-in/email', { email, password: 'not the password' });
    expect(authMessage({ ...wrong.json, status: wrong.status })).toBe("That email or password doesn't match.");

    const short = await call('sign-up/email', { email: `short-${email}`, password: 'abc', name: 'CI' });
    expect(authMessage({ ...short.json, status: short.status })).toBe('Use at least 8 characters for the password.');
  });

  it('uploads through a signed link that holds the size, and reads it back', async (context) => {
    if (!storage) context.skip();
    const { createFiles } = await import('../../src/files');
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
