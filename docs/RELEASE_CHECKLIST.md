# Pi Durable Edge v0.2.1 release review and regression list

> This document covers only the standalone repo `xiaomoBoy/pi-durable-edge`. It changes nothing in, and releases nothing of, the VPS/Docker edition `pi-durable-assistant`.
> **Test scope splits into automated local simulation and real Cloudflare remote deploys; neither replaces the other.**

## Review tasks and acceptance criteria for this round

| Priority | Item | Automated acceptance | Progress |
| --- | --- | --- | --- |
| P0 | Client errors keep 400/409 status after DO RPC | Local Wrangler HTTP asserts invalid params return 4xx | Coded, CI decides |
| P0 | Model-config store failure and provider-switch rollback | Model switching mutually exclusive, old provider recoverable | Coded, needs online fault-injection retest |
| P0 | Stop keys from echoing back or landing in Workers logs | GET config holds no key, internal API errors scrubbed | Coded, CI decides |
| P0 | SSRF protection baseline | Forbid HTTP/IP/localhost/intranet domains, allow public HTTPS | Coded, unit-tested; DNS rebinding still needs audit |
| P0 | Stop oversized requests and mixed-up error types | JSON requests byte-limited to 16 KiB, return 400/413/415 | Coded, unit-tested |
| P0 | Original Faux / persistence logic | Wrangler local DO runs 12 s, idempotent submits, alarms | Coded, CI decides |
| P0 | Model provider state switching | Local DO saves fake key, reads redacted, keyless model edit, switch back to Faux | Coded, CI decides |
| P1 | Frontend baseline security headers | Same-origin CSP, no-cache, no iframe, no-referrer | Submitted |
| P1 | Release flow and ongoing regression | PR passes Node tests, dry-run, Wrangler local smoke, then merges to main | Configured |

## How CI runs

```bash
npm install
npm run check           # Node syntax + pure unit tests + UI structure
npx wrangler deploy --dry-run --outdir dist-cf
npm run test:smoke      # Start Wrangler local Agent + SQLite-backed Durable Object
```

`test:smoke` uses **Faux and a fictitious API key**: no external paid model calls, no Cloudflare account. It walks real Worker HTTP/RPC through auth, static pages, invalid-input 4xx, task idempotency, Faux replies, timed alarms, Pi session model switching, and encrypted config saves. Each CI run creates an isolated `.wrangler/smoke-v02`, then shuts the local process down and removes the temporary `.dev.vars` at the end.

**A passing local simulation must never imply the production environment fully works.** PiHarness Beta and the Cloudflare free tier carry runtime, CPU, session, and alarm-scheduling limits.

## First real Cloudflare deploy (needs a maintainer)

1. Follow [DEPLOY.md](DEPLOY.md) to create the Worker from this **standalone repo's** `main` and configure the `ACCESS_TOKEN` secret.
2. Verify the homepage, mobile layout, response headers, and login at the deploy address. A new Worker owns **brand-new SQLite storage**.
3. Switch to Faux, test one 12-second task to completion, persistence across refresh, and a reminder flipping to fired on time.
4. Pick OpenAI Chat Completions, enter a working HTTPS Base URL, your own API key, and a model ID you can access, then send one very short request. Repeat for OpenAI Responses and Anthropic Messages. **Calls may bill**, so confirm quota before each request.
5. Remotely test a bad key (401/403), a bad model (404), rate limits (429), service timeouts, and session recovery after Worker redeploys; logs must never show a full key.
6. Deploy a new version while a task is running, confirm recovery from the checkpoint with no duplicate reminders. **Closing the browser is not a crash test**.
7. Check Cloudflare CPU/DO/SQLite usage against the free tier; lower the polling rate if needed.
8. On failure, copy the Workers logs with keys/account identifiers removed, investigate Beta compatibility first, and do not jump straight to a paid tier.

## Not done this round, still tracked

- **High priority**: end-to-end test on a real Cloudflare account; real OpenAI / Anthropic API responses and third-party protocol differences; fault injection for model switching mid-recovery.
- **Medium priority**: SSE or WebSocket streaming output (currently short-interval status polling); long-chat compaction and context caps; session clearing; observability for API request counts and token usage.
- **Long term**: multi-model profiles, key rotation independent of ACCESS_TOKEN, backup and export, multi-session, todo/memo, and restricted sub-agents.
- **Security limits**: a custom HTTPS domain may DNS-resolve to an unexpected address (DNS rebinding); only common intranet targets are currently blocked at the URL-syntax layer. Not fit for an untrusted multi-tenant open proxy. Needs a dedicated SSRF/rate-limit/identity review before a multi-user launch.

## Known product boundaries

- Cloudflare Free does not mean OpenAI/Anthropic APIs are free.
- Switching to Faux deletes the saved real-model key; switching back needs a re-entry.
- Single user, single Durable Object; no multi-session or attachments yet.
- PiHarness is still Beta. Any CI result only reflects its pinned version and the local simulator environment.

## Version verdict

Only when **CI on the standalone repo's main branch fully passes** may it be called "source and local Workers regression checks passed". Real Cloudflare deploys and paid model APIs **need separate acceptance**; otherwise it must not be called verified in production.
