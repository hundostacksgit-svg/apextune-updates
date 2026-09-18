# Getting the API live, and keeping it there

The editor works with none of this. Deploying the Worker adds four things:
free-form AI phrasing, accounts that follow people between devices, Team seat
enforcement, and transcription for captions.

**The honest position on uptime:** Cloudflare Workers run at the edge in
hundreds of locations with no server to fall over, and Cloudflare's own SLA is
99.99%. That is as close to 24/7 as anything gets without a second provider.
What makes an outage a non-event for your customers is the other half — the
app falls back to the on-device planner and carries on. Nobody is ever locked
out of editing because your API is having a bad afternoon.

---

## Deploy it

One command, from the repository:

```bash
cd server && ./deploy.sh
```

First run walks you through the database and the secrets. Later runs just
deploy. That's it.

If you'd rather do it by hand, `server/README.md` has the individual commands.

## Then never do it again

Add two secrets and every future change deploys itself when it's pushed:

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token** → use the
   **"Edit Cloudflare Workers"** template. Copy it.
2. This repo → **Settings → Secrets and variables → Actions → New secret**
   - `CLOUDFLARE_API_TOKEN` — the token
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare sidebar
   - `API_URL` *(optional)* — your Worker's URL, and the deploy will verify it
     answers before calling itself done

`.github/workflows/worker.yml` does the rest. Without those secrets it skips
itself quietly rather than failing every push.

## What it costs

| | Free plan | Paid ($5/mo) |
|---|---|---|
| Requests | 100,000/day | 10 million/month |
| CPU per request | **10ms** | 30 seconds |
| D1 database | 5GB, 5M reads/day | 5GB included |

**You need the paid plan**, and the reason is specific: passwords are stretched
with PBKDF2 at 210,000 rounds, which is 100-200ms of CPU. That is what makes a
stolen database expensive to attack, and it does not fit in 10ms. The
alternative is lowering `PBKDF2_ROUNDS` in `wrangler.toml`, which trades away
real security for $5 a month. Don't.

$5/month covers far more traffic than you will have for a long time. The AI
calls are the variable cost, and those are billed by Anthropic per request, not
by Cloudflare.

## Making an outage boring

Already built, nothing to configure:

- **Retries with backoff** — 1s then 2s, and only for failures worth retrying.
  A 402 (out of quota) fails the same way twice; a 502 usually doesn't.
- **A circuit breaker** — after three consecutive failures the app stops trying
  for two minutes and goes straight to the on-device planner. Without this, a
  server that is down makes every request wait for a timeout first, which turns
  one outage into an app that feels broken.
- **The local planner** handles the phrasings people actually use, offline. A
  customer whose API call fails gets a plan anyway, with a line saying where it
  came from.
- **Licences keep working.** They're checked on the device too, so nobody who
  paid loses access because the server is down.

## Watching it

```bash
cd server && npx wrangler tail        # live requests
curl https://your-worker.workers.dev/v1/health
```

`/v1/health` reports what is configured — AI, transcription, payments — and is
what the deploy workflow checks. Point any uptime monitor at it; a free
Cloudflare Health Check or UptimeRobot on a 5-minute interval is enough, and
it will tell you before a customer does.

## If you break something

```bash
cd server && npx wrangler rollback
```

Cloudflare keeps previous versions. Rolling back is instant and does not touch
the database.
