---
"@webtwizz/cloud": minor
---

Sites can send their own sign-in emails: `@webtwizz/cloud/emails` adds `handleSignInEmails()`, which checks each call comes from the site's sign-in service and hands over the address and code, and `signInEmailCopy()` with WebTwizz's wording.
