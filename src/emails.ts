import 'server-only';
import { env } from './env';

export type SignInEmail = {
  to: string;
  kind: 'code' | 'link';
  purpose: 'sign-in' | 'email-verification' | 'forget-password' | (string & {});
  code?: string;
  link?: string;
  expiresAt?: string;
};

export type SignInEmailOptions = {
  /** The sign-in address the site's settings point at; defaults to WEBTWIZZ_AUTH_URL. */
  authUrl?: string;
};

const MAX_AGE_MS = 5 * 60 * 1000;
const keys = new Map<string, { at: number; keys: JsonWebKey[] }>();

const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const toBase64Url = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function signingKey(authUrl: string, kid: string): Promise<CryptoKey | null> {
  const find = (list: JsonWebKey[]) => list.find((k) => (k as { kid?: string }).kid === kid && k.crv === 'Ed25519' && k.x);
  const cached = keys.get(authUrl);
  let match = cached ? find(cached.keys) : undefined;
  if (!match && (!cached || Date.now() - cached.at > 60_000)) {
    const response = await fetch(`${authUrl.replace(/\/+$/, '')}/.well-known/jwks.json`).catch(() => null);
    const list = ((await response?.json().catch(() => null))?.keys ?? []) as JsonWebKey[];
    keys.set(authUrl, { at: Date.now(), keys: list });
    match = find(list);
  }
  if (!match) return null;
  return crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: match.x }, { name: 'Ed25519' }, false, ['verify']);
}

/** True when the request really comes from the site's sign-in service. */
export async function verifySignInEmail(request: Request, body: string, options: SignInEmailOptions = {}): Promise<boolean> {
  const signature = request.headers.get('x-neon-signature');
  const kid = request.headers.get('x-neon-signature-kid');
  const timestamp = request.headers.get('x-neon-timestamp');
  if (!signature || !kid || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > MAX_AGE_MS) return false;
  const [header, middle, sig] = signature.split('.');
  if (!header || middle !== '' || !sig) return false;
  const key = await signingKey(options.authUrl ?? env('WEBTWIZZ_AUTH_URL'), kid);
  if (!key) return false;
  const input = new TextEncoder().encode(`${header}.${toBase64Url(`${timestamp}.${toBase64Url(body)}`)}`);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, fromBase64Url(sig), input).catch(() => false);
}

/** Route handler for the sign-in emails a site sends itself: `export const POST = handleSignInEmails(async (email) => { ... })`. */
export function handleSignInEmails(send: (email: SignInEmail) => Promise<void>, options: SignInEmailOptions = {}) {
  return async (request: Request): Promise<Response> => {
    const body = await request.text();
    if (!(await verifySignInEmail(request, body, options))) return Response.json({ error: 'signature' }, { status: 401 });
    const event = (() => { try { return JSON.parse(body); } catch { return null; } })();
    const type = event?.event_type;
    const data = event?.event_data ?? {};
    const to = String(event?.user?.email ?? data.email ?? '').trim().toLowerCase();
    if ((data.delivery_preference ?? 'email') === 'sms') return Response.json({ error: 'text messages are not sent' }, { status: 422 });
    if ((type !== 'send.otp' && type !== 'send.magic_link') || !to) return Response.json({ ok: true, skipped: true });
    const email: SignInEmail = {
      to,
      kind: type === 'send.otp' ? 'code' : 'link',
      purpose: String((type === 'send.otp' ? data.otp_type : data.link_type) ?? 'sign-in'),
      ...(data.otp_code ? { code: String(data.otp_code) } : {}),
      ...(data.link_url ? { link: String(data.link_url) } : {}),
      ...(data.expires_at ? { expiresAt: String(data.expires_at) } : {}),
    };
    try {
      await send(email);
    } catch (error) {
      console.error('[webtwizz-auth] The site could not send a sign-in email', error);
      return Response.json({ error: 'send' }, { status: 502 });
    }
    return Response.json({ ok: true });
  };
}

/** WebTwizz's own subject and wording for a sign-in email, for sites that send their own. */
export function signInEmailCopy(email: SignInEmail, site: string): { subject: string; text: string } {
  const code = email.kind === 'code';
  const copy = email.purpose === 'email-verification'
    ? { subject: `Confirm your email for ${site}`, lead: code ? `Enter this code on ${site} to confirm your email address.` : `Open this link to confirm your email address for ${site}.`, label: 'Confirmation code', note: `If you didn't sign up for ${site}, ignore this email.` }
    : email.purpose === 'forget-password'
      ? { subject: `Reset your ${site} password`, lead: code ? `Enter this code on ${site} to choose a new password.` : `Open this link to choose a new password for ${site}.`, label: 'Reset code', note: "If you didn't ask to reset your password, ignore this email. Your password stays the same." }
      : { subject: code ? `Your ${site} sign-in code` : `Sign in to ${site}`, lead: code ? `Enter this code on ${site} to sign in.` : `Open this link to sign in to ${site}.`, label: 'Sign-in code', note: `If you didn't try to sign in to ${site}, ignore this email.` };
  const value = code ? `${copy.label}: ${email.code}` : email.link;
  return { subject: copy.subject, text: `${copy.lead}\n\n${value}\n\n${copy.note}` };
}
