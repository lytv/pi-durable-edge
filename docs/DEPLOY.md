# Pi Durable Edge v0.2.1: deploy, update, and troubleshooting

## First, understand the two different "deploys"

| Scenario | Recommended entry | GitHub repo |
| --- | --- | --- |
| **Maintainer already owns `xiaomoBoy/pi-durable-edge`** | Cloudflare dashboard **Import a repository** | Links the existing repo directly, no copy |
| Other users installing the open-source project | [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaomoBoy/pi-durable-edge) | Cloudflare creates a new copy of the repo |

**If the previous Worker is already deleted, take the first path.** The one-click deploy button suits open-source sharing, but it copies the repo through a `seed_repo override`, so the first build does not support **Retry build**. That is not a code compile error; do not keep retrying that first build.

## 1. Recreate the Worker from the existing GitHub repo (recommended)

1. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create application → Import a repository**.
2. Pick the GitHub account and repo [`xiaomoBoy/pi-durable-edge`](https://github.com/xiaomoBoy/pi-durable-edge). If the repo is missing, check the GitHub App authorization first.
3. Pick the production branch **`main`** and the app name **`pi-durable-edge`** (must match the `name` in `wrangler.jsonc`).
4. Use the build parameters in the table below. Note this is a standalone root-directory project, **not** the `pi-durable-assistant/cloudflare` subdirectory.
5. Choose **Save and Deploy**, and confirm the Worker and the SQLite-backed Durable Object `Assistant` are created.
6. On first opening the Worker URL, enter your `ACCESS_TOKEN` and verify in Faux mode; real OpenAI/Anthropic keys can be configured from the page later.

| Setting | Value |
| --- | --- |
| Repository | `xiaomoBoy/pi-durable-edge` |
| Branch | `main` |
| Root directory | `/` |
| Build command | `npm run check` (optional, recommended) |
| Deploy command | `npm run deploy` or `npx wrangler deploy` |
| Worker name | `pi-durable-edge` |
| Worker runtime | Auto-configured from `wrangler.jsonc` |

Cloudflare configures the Durable Object classes and migrations from `wrangler.jsonc`; no manual D1, R2, KV, or Containers setup. The deploy project name must match the Wrangler Worker name. See the [Cloudflare Workers Builds docs](https://developers.cloudflare.com/workers/ci-cd/builds/).

### First-time ACCESS_TOKEN setup

It is **your app's access key**, not a GitHub or Cloudflare platform API token. Generate one with a password manager, or run locally:

```bash
openssl rand -hex 24
```

If the one-click deploy setup screen shows `ACCESS_TOKEN`, fill it in directly; when **Import existing repository** does not ask, add a **Secret** with the same name (at least 24 characters) under the Cloudflare dashboard at **Workers & Pages → pi-durable-edge → Settings → Variables and Secrets**, save, and publish. Open the page and enter the same key. Never put the key in `wrangler.jsonc`, GitHub, or issues.

`GET /api/model` never returns the plaintext API key. If you later replace `ACCESS_TOKEN`, the derived key encrypting the model key changes too, so re-save the model API key.

## 2. One-click deploy for other users

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xiaomoBoy/pi-durable-edge)

Cloudflare **creates a new copy of the GitHub repo** and connects Workers Builds; later edits to that copy's `main` branch trigger normal builds. New commits to upstream `xiaomoBoy/pi-durable-edge` **do not sync automatically** to your copy; merge or sync them yourself.

If GitHub already has a repo with the same name, pick another copy name at import; do not assume re-clicking the button refreshes the existing Worker.

## 3. Acceptance

[Pre-release regression and remote test list](RELEASE_CHECKLIST.md). A passing local Wrangler smoke test does not mean the real Cloudflare account and real model APIs pass.

1. Open the `workers.dev` URL, enter `ACCESS_TOKEN`, and connect.
2. In Faux mode click **One-click self-check**: verifies durable chat, idempotent operationIds, SQLite state, and durable reminders (up to 60 seconds).
3. Refresh the browser, confirm history persists; note a page refresh does not test a Worker crash.
4. In the right-side model settings pick OpenAI Chat Completions / Responses or Anthropic Messages; fill in a trusted HTTPS Base URL, model ID, and private API key. Real calls may bill, so test with one short message first.
5. Separately test real Cloudflare runtime behavior and interruption recovery; passing GitHub Actions or a Wrangler dry-run does not guarantee live model requests succeed.

## 4. Common errors

| Symptom | Fix |
| --- | --- |
| `Cannot retry a build that was created with a seed_repo override` | Seed builds cannot retry. **Do not use Retry**. Commit new code to the actually linked Git repo so a normal new build triggers; if the Worker is deleted, recreate it per section 1 and link the existing repo |
| `Your GitHub authorization has expired` | The Cloudflare GitHub App authorization expired. Check `Cloudflare Workers and Pages` under [GitHub Installed Apps](https://github.com/settings/installations) first, then reinstall per the [Cloudflare re-authorization guide](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#reinstall-the-cloudflare-github-app). No repo code change can complete GitHub authorization for you |
| `Worker name ... must match` | The Worker name created in Cloudflare must match `pi-durable-edge` in `wrangler.jsonc` |
| API `503` | `ACCESS_TOKEN` unset or shorter than 24 characters |
| API `401` | The access key entered on the site differs from the Worker secret |
| GitHub has new commits but Cloudflare does not update | Check whether the Worker **Settings → Builds → Git Repository** points at `xiaomoBoy/pi-durable-edge` `main`, not a deleted project or an old repo |
| Runtime `500` | Check the Worker **Observability / Logs**; possibly a PiHarness Beta, Durable Object SQLite, or model provider compatibility issue; redact the API key before sharing logs |

**Note:** uninstalling the Cloudflare GitHub App may briefly affect auto-builds of other projects under the account; if other projects already use it, assess the impact first. A GitHub App authorization failure is a Cloudflare/GitHub account-level problem, not an error fixable by editing project code alone.

## 5. When GitHub authorization fails, deploy directly with Wrangler

```bash
git clone https://github.com/xiaomoBoy/pi-durable-edge.git
cd pi-durable-edge
npm install
npm run check
npx wrangler login
npm run deploy
npx wrangler secret put ACCESS_TOKEN
```

This path needs no Cloudflare GitHub App, but it does not set up automatic GitHub → Cloudflare deploys; to add auto-deploy later, connect the GitHub repo under the Worker **Settings → Builds**.

## 6. Ongoing maintenance

With a working GitHub integration, every commit to the **actually linked repo's** `main` triggers an automatic Cloudflare build and deploy. GitHub Actions only runs tests and a Wrangler dry-run; it stores no Cloudflare account API token and never creates or deletes Workers directly.

A Durable Object recreated after deleting the old Worker **is new storage**; old tasks, messages, and saved model configs must not be assumed to restore automatically. Do not mistake a fresh install for an in-place upgrade of the original instance.

Project sources: [pi-durable-edge](https://github.com/xiaomoBoy/pi-durable-edge) · [PiHarness](https://developers.cloudflare.com/agents/harnesses/pi/) · [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
