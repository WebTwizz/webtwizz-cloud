---
"@webtwizz/cloud": minor
---

Visitors only see WebTwizz names: session cookies are `__Secure-webtwizz-auth.*`, the sign-in route drops the sign-in service's own response headers, and sign-in log lines say `[webtwizz-auth]`. Visitors signed in on 0.1.0 sign in again once.
