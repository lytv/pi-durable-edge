# Pi Durable Edge

A durable personal agent built on **Cloudflare Workers + SQLite-backed Durable Objects + PiHarness**. An independently maintained Cloudflare edition, derived from [Pi Durable Assistant](https://github.com/xiaomoBoy/pi-durable-assistant).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaomoBoy/pi-durable-edge)

**[Deploy guide](docs/DEPLOY.md)** · [Release review and test matrix](docs/RELEASE_CHECKLIST.md) · [Follow-up roadmap](docs/V02_PLAN.md)

> **v0.2.1**: covered by unit tests, Wrangler bundling, and local Durable Object HTTP integration tests; remote deployment on a Cloudflare account, real OpenAI/Anthropic APIs, and crash recovery still await live verification.

## Features

- **Original UI**: reuses the Pi Durable Assistant three-column layout, message bubbles, responsive styles, and the "Xiao-D" mascot.
- **Model settings**: OpenAI Chat Completions / Responses, Anthropic Messages, and Faux; supports HTTPS Base URL, API Key, model ID, context window, output tokens, and a reasoning flag. API keys are stored encrypted on the server; config reads never return plaintext.
- **Durable chat**: submits messages through PiHarness and persists the transcript, so it survives a refresh.
- **Durable scheduled reminders**: the Cloudflare Agents Scheduler wakes on expiry, and the page records the reminder status.
- **Free verification**: Faux runs a fixed script and replies after a 12-second delay; it never calls a paid model. Charges from real models are billed by the corresponding API provider.

Currently single-user with a single Durable Object; multi-session, sub-agents, attachments, task cancellation, and a WeChat bridge are not implemented yet, and the UI shows no controls without a matching backend capability.

## Fresh deploy: first decide whether to create another GitHub copy

**You already own the `xiaomoBoy/pi-durable-edge` repo (maintainer, recommended):** do not click the deploy button above to copy the repo again. Go to the Cloudflare dashboard **Workers & Pages → Create application → Import a repository**, pick `xiaomoBoy/pi-durable-edge`, the `main` branch, root directory `/`, and deploy command `npm run deploy`. That connects the current repo, and later pushes trigger normal builds automatically.

**Everyone else (true one-click deploy):** click **Deploy to Cloudflare** above, authorize GitHub, and deploy. The official button **creates a new copy of the repo under your GitHub account**, then creates a Worker and Durable Object for it; it is not a "retry" of an existing build. <a href="https://developers.cloudflare.com/workers/platform/deploy-buttons/">Cloudflare's official explanation</a>.

On first deploy, fill in your own generated **`ACCESS_TOKEN`** (a random string of at least 24 characters). If the deploy screen does not ask for it, add a Secret named `ACCESS_TOKEN` under the Worker's **Settings → Variables and Secrets**; do not substitute a GitHub token or Cloudflare token.

When done, open the `workers.dev` address Cloudflare gives you, enter the same `ACCESS_TOKEN`, and click **One-click self-check** in Faux mode. Then add your own API under the model settings on the right as needed.

**Important:** the first build created from the one-click deploy button is a `seed_repo override` and cannot be re-run with **Retry build**. New code should be committed to the GitHub repo it is **actually linked to**, and a new commit triggers the build. See the [deploy guide](docs/DEPLOY.md) for the full explanation, auth fixes, and the Wrangler fallback.

## v0.2.1 quality review

- JSON request bodies limited to 16 KiB; invalid input still returns the correct 4xx after crossing the Durable Object RPC boundary.
- Model switching guarded by a mutex with rollback; custom API Base URLs forbid HTTP, IP, and local domains.
- Model keys encrypted and redacted, internal runtime errors scrubbed; static pages gained a same-origin CSP and no-cache response headers.
- CI now runs real **Wrangler local Worker / Durable Object** HTTP tests covering Faux chats, idempotency, alarms, and model-config switching with no paid requests.

[Full regression list, risks, and remote test steps](docs/RELEASE_CHECKLIST.md).

## Local verification

```bash
git clone https://github.com/xiaomoBoy/pi-durable-edge.git
cd pi-durable-edge
npm install
npm run check
cp .dev.vars.example .dev.vars
# Replace the ACCESS_TOKEN inside .dev.vars with a personal random key of at least 24 characters
npm run dev
```

## API (all require `Authorization: Bearer <ACCESS_TOKEN>`)

| Route | Purpose |
| --- | --- |
| `GET /api/state` | Chat transcript, running tasks, reminders |
| `GET /api/model` | Model config without the plaintext key |
| `PUT /api/model` | Save and enable a model |
| `POST /api/chat` | Submit an idempotent task: `text`, `operationId` |
| `POST /api/reminders` | Submit a delayed reminder: `text`, `seconds` |

The platform free quota is bound by Workers, Durable Objects, and database resources; PiHarness Beta compatibility needs online testing. A newly deployed Durable Object is a fresh data space: history from a deleted Worker does not restore automatically.
