# @webtwizz/cloud

Sign-ins, database and file storage for sites built on [WebTwizz](https://webtwizz.com) Cloud.

```sh
npm install @webtwizz/cloud
```

WebTwizz puts every setting in the site's environment, so each module works with no arguments.

| Import | What it gives you |
| --- | --- |
| `@webtwizz/cloud` | `authMessage(error)` plain words for sign-in errors, `MESSAGES` for unavailable and failed saves |
| `@webtwizz/cloud/server` | `createAuth()` with `.handler()`, `.middleware()`, `.getSession()` and the server sign-in methods |
| `@webtwizz/cloud/client` | `createAuthClient()` for client components |
| `@webtwizz/cloud/db` | `createDb()`, a `postgres` client with pooler-safe settings |
| `@webtwizz/cloud/emails` | `handleSignInEmails()` for sites that send their own sign-in emails, `signInEmailCopy()` for the wording |
| `@webtwizz/cloud/files` | `createFiles()` with `uploadUrl`, `publicUrl`, `privateUrl`, `remove` |

`server`, `db`, `files` and `emails` are server-only. [AI_GUIDE.md](AI_GUIDE.md) has the full walkthrough and ships with each version.

## Environment

| Variable | Used by |
| --- | --- |
| `WEBTWIZZ_AUTH_URL`, `WEBTWIZZ_AUTH_SECRET` | `server` |
| `DATABASE_URL` | `db` |
| `WEBTWIZZ_STORAGE_ENDPOINT`, `WEBTWIZZ_STORAGE_REGION`, `WEBTWIZZ_STORAGE_KEY`, `WEBTWIZZ_STORAGE_SECRET` | `files` |
| `WEBTWIZZ_STORAGE_READ_KEY`, `WEBTWIZZ_STORAGE_READ_SECRET` | `files` private links |
| `WEBTWIZZ_FILES_URL`, `WEBTWIZZ_STORAGE_MAX_FILE_MB` | `files`, optional |

## Development

```sh
npm ci
npm test                 # unit tests
npm run test:integration # real throwaway project, needs NEON_API_KEY
npm run build
```

`test/fixture` is a small Next app that CI builds against the packed tarball.

To try a change in the local WebTwizz preview site without publishing: `npm run preview` builds the package, puts it in the preview container's `node_modules` under a unique dev version, and restarts its dev server (about 10 seconds). `npm run dev` does the same on every save.

## Releases

- Add a changeset (`npx changeset`) to any PR that changes what sites get.
- When CI passes on `main`, the Release workflow versions, tags and publishes to npm with provenance (trusted publishing, no token).
- Dependency updates merged by Renovate ship as a patch on their own.
- Run the Release workflow by hand to publish the current commit under the `next` tag and try it on a test site first.

Sites pin an exact version, so a release never changes a live site until WebTwizz upgrades it.

The WebTwizz AI builds from its own copy of AI_GUIDE.md. After a release, run `npm run cloud:sync <version>` in the ai-service so new sites get that version and its guide.

## License

MIT
