import { describe, expect, it } from 'vitest';
import { cookieHeaderToTheirs, setCookieToOurs, toOurs, toTheirs } from '../src/cookies';

describe('cookie names', () => {
  it('translates both ways and leaves other cookies alone', () => {
    expect(toTheirs('__Secure-webtwizz-auth.session_token')).toBe('__Secure-neon-auth.session_token');
    expect(toOurs('__Secure-neon-auth.local.session_data')).toBe('__Secure-webtwizz-auth.local.session_data');
    expect(toOurs('theme')).toBe('theme');
    expect(cookieHeaderToTheirs('theme=dark; __Secure-webtwizz-auth.session_token=abc=; ph=1'))
      .toBe('theme=dark; __Secure-neon-auth.session_token=abc=; ph=1');
    expect(cookieHeaderToTheirs('theme=dark')).toBe('theme=dark');
    expect(cookieHeaderToTheirs(null)).toBeNull();
    expect(setCookieToOurs('__Secure-neon-auth.session_token=a.b; Max-Age=0; Path=/')).toBe('__Secure-webtwizz-auth.session_token=a.b; Max-Age=0; Path=/');
  });
});
