# @webtwizz/cloud: building on WebTwizz Cloud

Read this before writing sign-ins, database code or file uploads on a site with WebTwizz Cloud. It matches the version installed next to it. Call all of it WebTwizz Cloud (sign-ins, database, files) and never name any company behind it.

Every setting is already in the site's environment (`WEBTWIZZ_AUTH_URL`, `WEBTWIZZ_AUTH_SECRET`, `DATABASE_URL`, `WEBTWIZZ_STORAGE_*`, `WEBTWIZZ_FILES_URL`). Never add, rename or print them.

## Sign-ins

1. `src/lib/auth/server.ts`

```ts
import { createAuth } from '@webtwizz/cloud/server';

export const auth = createAuth();
```

2. `src/app/api/auth/[...path]/route.ts`

```ts
import { auth } from '@/lib/auth/server';

export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
```

3. `src/lib/auth/client.ts`, the browser client. It takes no arguments and talks to the route above.

```ts
import { createAuthClient } from '@webtwizz/cloud/client';

export const authClient = createAuthClient();
```

4. In client components: `authClient.signUp.email({ email, password, name })`, `authClient.signIn.email({ email, password })`, `authClient.signOut()`. Each returns `{ data, error }`. Never show `error.message`. Keep what they typed, `console.error(error)`, and show `authMessage(error)`:

```ts
import { authMessage } from '@webtwizz/cloud';

const { error } = await authClient.signIn.email({ email, password });
if (error) setMessage(authMessage(error));
```

For wording that fits the site, pass overrides: `authMessage(error, { USER_ALREADY_EXISTS: 'You already have a booking account.' })`.

Confirm email is off unless the owner turns it on in Settings > Cloud > Users, so sign-up signs people straight in and an unconfirmed email never stops a sign-in. When the owner turns on Confirm email, sign-up returns no session and the 6-digit code is emailed automatically. Show a code step: `authClient.emailOtp.verifyEmail({ email, otp })`, then sign them in, with a "Send a new code" button that calls `authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' })`. Never send the first code yourself.

5. Protect pages in `src/proxy.ts`, listing only the protected routes in the matcher (a matcher over every path blocks the sign-in page's own scripts):

```ts
import { auth } from '@/lib/auth/server';

export default auth.middleware({ loginUrl: '/sign-in' });

export const config = { matcher: ['/account/:path*'] };
```

6. On the server, check the session before protected data or any write, in the route handler or server action itself:

```ts
const { data: session } = await auth.getSession();
if (!session?.user) return Response.json({ error: 'Sign in first' }, { status: 401 });
```

Never destructure `{ user }` from the top level.

7. Signed-up users are rows in the `webtwizz.users` view (`id`, `name`, `email`, `email_verified`, `image`, `role`, `created_at`), kept by sign-ins. Read it, never write to it, never create a users or passwords table. Your own tables keep a plain `user_id uuid` column (no foreign key) set from `session.user.id`.

8. Every sign-in page gets a "Forgot password?" link to `/reset-password`, a client page in two steps: their email, then `authClient.forgetPassword.emailOtp({ email })`, which emails a 6-digit code; then the code and a new password, then `authClient.emailOtp.resetPassword({ email, otp, password })`, then send them to sign in. Leave `/reset-password` out of the proxy matcher. The owner can also send a reset code from the Data panel, and it lands on this page.

9. Admins are accounts whose role is `'admin'`. Admin pages and admin writes check it on the server, the same way as step 6:

```ts
const { data: session } = await auth.getSession();
if (session?.user?.role !== 'admin') return Response.json({ error: 'Admins only' }, { status: 403 });
```

The first admin is the owner's own account on the site: they sign up like any visitor (their WebTwizz account is separate), then make that account an admin under Users in the Data panel, or ask you to do it. A new role reaches their session within a few minutes, or right away when they sign in again.

Sign-ins are email and password only. Sign-in emails (reset codes, confirmations) are sent for the site automatically; never build email sending or add an email service for them. If the user asks for another way to sign in, say WebTwizz Cloud sign-ins are email and password for now and build that.

Sites built before this package import sign-ins from another package in `src/lib/auth/`. When you work on their sign-ins, move `server.ts`, `client.ts` and the auth route to the files above (same sign-ins, same users) and remove the old package.

### Sending sign-in emails yourself

Only when the owner picked "Your site" under Cloud > Users > Emails. Add `src/app/api/sign-in-emails/route.ts`; the site's sign-in service calls it with every code, and the package checks the call really comes from it:

```ts
import { handleSignInEmails, signInEmailCopy } from '@webtwizz/cloud/emails';

export const POST = handleSignInEmails(async (email) => {
  const { subject, text } = signInEmailCopy(email, 'Site name');
  // send `subject` and `text` to `email.to` with the site's email connector, e.g. Resend
});
```

`email` has `to`, `kind` ('code' or 'link'), `purpose` ('email-verification', 'forget-password' or 'sign-in'), and `code` or `link`. Throw if sending fails: the visitor sees the sign-in fail instead of waiting for an email that never comes. It starts working once the site is published; until then WebTwizz sends them.

## Database

One shared client, server-side only (route handlers, server components, server actions):

```ts
// src/lib/db.ts
import { createDb } from '@webtwizz/cloud/db';

export const sql = createDb();
```

It is the `postgres` package with pooler-safe settings, so queries look like ``await sql`select * from notes where user_id = ${session.user.id}` ``. Schema and data changes go through the `database` tool.

The database can pause or fill up on the owner's plan. Wrap reads and saves in try/catch and show `MESSAGES.unavailable` on a page or `MESSAGES.saveFailed` on a form (`import { MESSAGES } from '@webtwizz/cloud'`). Visitors never see WebTwizz, plans or limits.

Pages that only show data set `export const revalidate = 60`, and the server action that saves calls `revalidatePath` for them. Pages for a signed-in user stay dynamic.

The database runs while pages read or save data and stops after 5 quiet minutes; its running time comes out of the owner's monthly allowance. So a page that refreshes data on a timer (a feed, a chat, a dashboard) refreshes only while the tab is visible, and again when the visitor comes back:

```ts
useEffect(() => {
  const refresh = () => { if (document.visibilityState === 'visible') load(); };
  const timer = setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', refresh);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
}, []);
```

## Files

Two buckets: `public` (anyone can view, for images shown on the site) and `private` (documents, opened through short-lived links). Images you place on pages yourself keep using the usual image tools; this is for what visitors or the site's features upload.

```ts
// src/app/api/uploads/route.ts
import { MESSAGES } from '@webtwizz/cloud';
import { FileError, createFiles } from '@webtwizz/cloud/files';
import { auth } from '@/lib/auth/server';

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: 'Sign in first' }, { status: 401 });
  const { name, type, size } = await request.json();
  try {
    const upload = await createFiles().uploadUrl({ bucket: 'public', name, type, size, folder: session.user.id, accept: ['image/*'] });
    return Response.json(upload);
  } catch (error) {
    if (error instanceof FileError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: MESSAGES.uploadsPaused }, { status: 503 });
  }
}
```

The browser then sends the file with exactly the returned headers: `fetch(upload.url, { method: 'PUT', headers: upload.headers, body: file })`. The link holds the file's size, so send the same file you described. If the PUT fails with an access error, storage is full: show `MESSAGES.uploadsPaused`. Save `upload.key` in your table.

Show files with `createFiles().publicUrl(key)` in a plain `<img>` or link, or `await createFiles().privateUrl(key)` (5 minutes; pass `{ download: 'name.pdf' }` to download) after checking the visitor may see it. Remove with `createFiles().remove(bucket, key)`. Never reuse a key.

## Owner tools

The owner manages users under Users in the Data panel (make admin, password reset, block, delete with their rows, export), sets who can sign up and the sign-in emails in Settings > Cloud > Users, and downloads everything from Settings > Cloud > Database. Point them there when they ask.
