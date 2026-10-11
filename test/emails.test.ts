import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleSignInEmails, signInEmailCopy, type SignInEmail } from '../src/emails';

const AUTH = 'https://auth.example.com/app/auth';
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64 = (value: string) => b64url(new TextEncoder().encode(value));
let keys: CryptoKeyPair;
let jwk: JsonWebKey;

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' } as JsonWebKey;
  vi.stubGlobal('fetch', async (url: string) => (String(url) === `${AUTH}/.well-known/jwks.json` ? Response.json({ keys: [jwk] }) : new Response('', { status: 404 })));
});

afterEach(() => {
  delete process.env.WEBTWIZZ_AUTH_URL;
});

async function signed(event: unknown, { at = Date.now(), tamper = false } = {}) {
  const body = JSON.stringify(event);
  const header = text64(JSON.stringify({ alg: 'EdDSA', kid: 'k1' }));
  const input = `${header}.${text64(`${at}.${text64(body)}`)}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keys.privateKey, new TextEncoder().encode(input)));
  return new Request('https://site.example.com/api/sign-in-emails', {
    method: 'POST',
    headers: { 'x-neon-signature': `${header}..${b64url(sig)}`, 'x-neon-signature-kid': 'k1', 'x-neon-timestamp': String(at) },
    body: tamper ? body.replace('123456', '654321') : body,
  });
}

const reset = { event_type: 'send.otp', event_id: 'e1', user: { email: 'Ada@Example.com' }, event_data: { otp_code: '123456', otp_type: 'forget-password' } };

describe('handleSignInEmails', () => {
  it('hands the site a checked email to send', async () => {
    process.env.WEBTWIZZ_AUTH_URL = AUTH;
    const sent: SignInEmail[] = [];
    const response = await handleSignInEmails(async (email) => { sent.push(email); })(await signed(reset));
    expect(response.status).toBe(200);
    expect(sent).toEqual([{ to: 'ada@example.com', kind: 'code', purpose: 'forget-password', code: '123456' }]);
  });

  it('refuses requests the sign-in service did not sign, or old ones', async () => {
    process.env.WEBTWIZZ_AUTH_URL = AUTH;
    const send = vi.fn();
    expect((await handleSignInEmails(send)(await signed(reset, { tamper: true }))).status).toBe(401);
    expect((await handleSignInEmails(send)(await signed(reset, { at: Date.now() - 10 * 60 * 1000 }))).status).toBe(401);
    expect((await handleSignInEmails(send)(new Request('https://site.example.com/x', { method: 'POST', body: '{}' }))).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('fails the sign-in when the site cannot send, and turns down text messages', async () => {
    process.env.WEBTWIZZ_AUTH_URL = AUTH;
    const failing = handleSignInEmails(async () => { throw new Error('provider down'); });
    expect((await failing(await signed(reset))).status).toBe(502);
    const sms = { ...reset, event_data: { ...reset.event_data, delivery_preference: 'sms' } };
    expect((await handleSignInEmails(async () => {})(await signed(sms))).status).toBe(422);
  });

  it('gives the WebTwizz wording', () => {
    const copy = signInEmailCopy({ to: 'a@b.co', kind: 'code', purpose: 'email-verification', code: '111222' }, 'Crumb & Co');
    expect(copy.subject).toBe('Confirm your email for Crumb & Co');
    expect(copy.text).toContain('Confirmation code: 111222');
  });
});
