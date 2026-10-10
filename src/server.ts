import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';
import { NextRequest } from 'next/server';
import { cookieHeaderToTheirs, setCookieToOurs, THEIRS } from './cookies';
import { env } from './env';

export type AuthOptions = {
  url?: string;
  secret?: string;
  sessionDataTtl?: number;
};

export type Auth = ReturnType<typeof createNeonAuth>;

const PROVIDER_HEADER = /^x-neon-/i;

function forLibrary<T extends Request>(request: T, make: (request: T, headers: Headers) => T): T {
  const cookie = request.headers.get('cookie');
  const translated = cookieHeaderToTheirs(cookie);
  if (translated === cookie) return request;
  const headers = new Headers(request.headers);
  headers.set('cookie', translated as string);
  return make(request, headers);
}

/** What visitors get back: WebTwizz cookie names and none of the sign-in service's own headers. */
export function forBrowser<T extends Response>(response: T): T {
  const provider = [...response.headers.keys()].filter((name) => PROVIDER_HEADER.test(name));
  const cookies = response.headers.getSetCookie();
  const rename = cookies.some((cookie) => cookie.startsWith(THEIRS));
  if (!provider.length && !rename) return response;
  const apply = (headers: Headers) => {
    for (const name of provider) headers.delete(name);
    if (rename) {
      headers.delete('set-cookie');
      for (const cookie of cookies) headers.append('set-cookie', setCookieToOurs(cookie));
    }
  };
  try {
    apply(response.headers);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    apply(headers);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers }) as T;
  }
}

export function createAuth(options: AuthOptions = {}): Auth {
  const auth = createNeonAuth({
    baseUrl: options.url ?? env('WEBTWIZZ_AUTH_URL'),
    cookies: {
      secret: options.secret ?? env('WEBTWIZZ_AUTH_SECRET'),
      sessionDataTtl: options.sessionDataTtl,
    },
  });
  const handler = auth.handler.bind(auth);
  const middleware = auth.middleware.bind(auth);

  auth.handler = () => {
    const methods = handler();
    type Method = (typeof methods)['GET'];
    const wrap = (method: Method): Method => async (request, context) =>
      forBrowser(await method(forLibrary(request, (original, headers) => new Request(original, { headers })), context));
    return { GET: wrap(methods.GET), POST: wrap(methods.POST), PUT: wrap(methods.PUT), DELETE: wrap(methods.DELETE), PATCH: wrap(methods.PATCH) };
  };
  auth.middleware = (config) => {
    const run = middleware(config);
    return async (request) => forBrowser(await run(forLibrary(request, (original, headers) => new NextRequest(original, { headers }))));
  };
  return auth;
}
