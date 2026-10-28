---
"@webtwizz/cloud": patch
---

Signed-in visitors can sign out, and `authClient` can read their session: since 0.2.0 the sign-in route answered both with a server error inside Next, because it copied a request Next hands over as a Proxy. Visitors who pressed Sign out stayed signed in.
