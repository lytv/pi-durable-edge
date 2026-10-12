# Pi Durable Edge v0.2: model settings and basic chat

Status: long-term iteration plan for the standalone repo `xiaomoBoy/pi-durable-edge`. v0.2.1 finished the review fixes and local Workers integration tests; **the real Cloudflare environment and model APIs still await acceptance**.

## UI strategy: reuse the original Pi Durable Assistant (implemented on this branch)

- **Reuse the original project's real page assets**: `public/style.css` is copied in full to `public/style.css`; the left session bar, middle chat stream and input box, right-side Xiao-D mascot, and the class structure and responsive styles of the task/reminder cards come from the original project.
- **Keep Xiao-D's original SVG and state styles**: `public/mascot.js` holds visual assets extracted from the original `public/app.js`; states update while running vs. idle.
- **Do not copy the original 83 KB of legacy JavaScript**: the original `public/app.js` depends on Node HTTP/SSE, multi-session, attachments, and other endpoints. The Cloudflare `public/app.js` is only a minimal API adapter layer that reuses the UI without building a new framework.
- **Edge-specific tweaks live in `public/edge.css`**: the model settings dialog, access-token dialog, single-session notes, durable task states, and scheduled reminders. Later original-design changes can sync styles there instead of maintaining a fully separate design.
- Multi-session, archiving, fork, attachments, task cancellation, and manually triggered Worker crashes are currently unimplemented, so the matching original controls are hidden / not rendered; **a button must never exist without an API**.
- **Mobile** keeps the original CSS drawer pattern; the menu and model dialog bind through the Edge adapter script.
- The full in-browser UI experience still needs a remote deploy or real browser regression; CI's static DOM checks cannot replace interaction testing.

## Scope and principles

Stay on Workers + SQLite-backed Durable Objects + PiHarness; the `faux` free demo stays available. Real large models connect through Pi AI's `createProvider`, **never bypassing Pi Durable sessions and task submits**.

### P0-1 Model settings (code implemented, remote verification pending)

- After access-token authorization, open the model settings panel on the same page.
- Protocols: OpenAI Chat Completions / OpenAI Responses / Anthropic Messages / Faux.
- Settings: HTTPS Base URL, model ID, API Key, Context Window, Max Output Tokens, Reasoning switch.
- Save via `PUT /api/model`; `GET /api/model` returns only model metadata plus `hasKey`, never the API key.
- Keys are encrypted with AES-256-GCM first; ciphertext lives in Durable Object SQLite, and the derived key comes from the Cloudflare Secret `ACCESS_TOKEN`. Replacing the access token makes the old key undecryptable, so re-enter it on the page.
- URLs must be HTTPS; localhost, private networks, and credentials embedded in the URL are rejected; switching protocol or address must never silently reuse the old key.
- Check PiHarness for unfinished tasks before switching models; avoid swapping providers mid-flight.

### P0-2 Chat (code implemented, remote verification pending)

- Send multi-line text: Enter submits, Shift+Enter inserts a newline.
- Still uses PiHarness `submit()`, `pending()`, and `session().messages()`.
- Real model replies render in the same chat UI; refreshing or closing the page never clears the persisted session.
- Retries use an idempotent `operationId`.
- Faux remains the verification entry point that calls no external model and costs no tokens.

### P0-3 Compatibility and security regression

- Node built-in tests: protocol validation, private-network URL rejection, correct AES-GCM key decryption, wrong access tokens cannot decrypt, provider registration.
- GitHub Actions: `npm run check` + Wrangler `deploy --dry-run`.
- Verify on a real Cloudflare Free account: save an OpenAI key, send a real message, switch to Anthropic, refresh persisted history, chat again after restart.
- Record free-plan CPU / request quotas and PiHarness Beta compatibility; **only mark production-ready after the above live verification passes**.

## Next batch (P1: not delivered this round)

1. **Connection test**: a frontend button fires one minimal model request with an explicit may-be-billed warning, distinguishing auth failure, 404 unknown model, and quota limits; failure messages scrubbed.
2. **Multi-model profiles**: save several model configs, pick a default model, import/export keyless JSON; encryption key rotation.
3. **Session management**: create/switch/reset sessions, multi-session list, Markdown export.
4. **Tool restoration**: pick `todo`, `memo`, `current_time` from the VPS edition; every side effect must stay replay-idempotent.
5. **Observability**: error states, run durations, token usage and cost estimates, rate-limit and quota hints.
6. **Security hardening**: stricter target-address validation, Cloudflare Access, key revoke/delete endpoints, data backup; audit multi-user risk before launching.

## Acceptance flow after a real deploy

1. Test chat/reminders with the original project's `faux` (free).
2. Open the settings page, pick `OpenAI · Chat Completions`, `https://api.openai.com/v1`, and save with the model in use and a real API key.
3. Send "Hello, reply in one sentence", watch the model reply; close and reopen the browser, confirm history persists.
4. Switch to `Anthropic · Messages`, `https://api.anthropic.com`, and test with a key and model ID holding the matching permission.
5. Leave the key blank while keeping the protocol + Base URL to change the model ID without re-entering; switching back to Faux stops paid model calls.
6. Retry switching models while a task is running: it must clearly ask to wait and must not break the in-flight work.

**Cost note:** the Cloudflare platform has a free quota; calls to real OpenAI, Anthropic, or third-party compatible APIs bill through that provider, so $0 cannot be guaranteed. The UI must never run a paid connection test on its own.

Official references: [Cloudflare PiHarness](https://developers.cloudflare.com/agents/harnesses/pi/) · [Pi AI custom providers](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md).
