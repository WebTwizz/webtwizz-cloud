# @webtwizz/cloud

## 0.3.0

### Minor Changes

- f6f3ed3: When Confirm email is on, the sign-up code now goes out through WebTwizz's own emails: the site's sign-in route asks for it right after a sign-up that needs confirming.

## 0.2.0

### Minor Changes

- 038e061: Visitors only see WebTwizz names: session cookies are `__Secure-webtwizz-auth.*`, the sign-in route drops the sign-in service's own response headers, sign-in log lines say `[webtwizz-auth]`, and uploads go through the site's files address like every other file link. Visitors signed in on 0.1.0 sign in again once.

## 0.1.0

- Sign-ins (`createAuth`, `createAuthClient`), plain words for every sign-in error (`authMessage`), a pooler-safe database client (`createDb`) and file uploads and links (`createFiles`).
