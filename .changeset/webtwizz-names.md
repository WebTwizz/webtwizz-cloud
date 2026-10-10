---
"@webtwizz/cloud": minor
---

Visitors only see WebTwizz names: session cookies are `__Secure-webtwizz-auth.*`, the sign-in route drops the sign-in service's own response headers, sign-in log lines say `[webtwizz-auth]`, and uploads go through the site's files address like every other file link. Visitors signed in on 0.1.0 sign in again once.
