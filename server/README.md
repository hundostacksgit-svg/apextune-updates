# The OmniDx Studio backend

Optional. The editor is complete without it — accounts, licences and projects
all work on the device. Deploy this when you want:

- accounts that follow someone between their laptop and their phone,
- licences verified on a server instead of in the buyer's browser,
- free-form AI phrasing rather than the built-in planner's vocabulary,
- speech-to-text for captions.

One file, one database, about a dozen routes.

## Deploy

```bash
cd server
npm install

npx wrangler d1 create omnidx-studio     # paste the id into wrangler.toml
npm run db:init                          # create the tables

npx wrangler secret put ANTHROPIC_API_KEY        # for the AI planner
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # for automatic licence delivery
npx wrangler secret put RESEND_API_KEY           # optional: email the key
npx wrangler secret put STT_URL                  # optional: transcription
npx wrangler secret put STT_KEY

npm run deploy
```

Then point the app at it: **Settings → Cloud brain → Worker URL** (visible at
Expert level), or set `DEFAULT_API_BASE` in `studio/assets/config.js` so every
copy uses it.

Check it came up:

```bash
curl https://your-worker.workers.dev/v1/health
# {"ok":true,"ai":true,"transcription":false,"payments":true}
```

## The CPU thing, before you deploy

Passwords are stretched with PBKDF2-SHA-256 at 210,000 iterations. That is a
deliberate cost — it is what makes a stolen database expensive to attack — and
it is roughly 100-200ms of CPU per login.

**Workers' free plan caps CPU at 10ms per request, so logins will fail on it.**
Either use the $5/month paid plan, or drop `PBKDF2_ROUNDS` in `wrangler.toml`
to something the free plan allows and understand you have traded away real
resistance to an offline attack. There is no third option; a fast hash is a
weak hash.

## Routes

| Route | Does |
|---|---|
| `GET /v1/health` | What is configured. |
| `POST /v1/auth/signup` | Create an account, register the device, return a session. |
| `POST /v1/auth/login` | Same, with the device limit enforced. |
| `POST /v1/auth/logout` | Drop the session. |
| `POST /v1/devices/list` | The machines on this account. |
| `POST /v1/devices/remove` | Sign one out. |
| `POST /v1/licence/redeem` | Attach a key to the account. |
| `POST /v1/rate` | A star rating from the app or the site. One row per device per day. |
| `GET /v1/rate/summary` | Count and average, the average only once there are five. |
| `POST /v1/ai/plan` | Prompt + media summary → an edit plan. |
| `POST /v1/ai/transcribe` | Audio → caption cues, via your STT service. |
| `POST /v1/webhooks/stripe` | Payment → licence → email. |

## What it stores, and what it doesn't

**Stores:** email, a PBKDF2 hash of the password, a display name, one row per
device (a random id generated on that device, plus the browser and OS family),
licences, and a monthly AI counter.

**Never sees:** your footage, your audio, your projects, or a frame of video.
The AI route is sent the prompt and a list of file names, durations and whether
each has sound. The transcription route is the one exception and only runs when
you ask for captions.

**Sessions** store a SHA-256 of the token, not the token. A stolen database
cannot be used to impersonate anyone.

## Transcription

Anthropic's API does not do speech-to-text, so `/v1/ai/transcribe` is a pass to
whichever service you point `STT_URL` and `STT_KEY` at. The response shaping in
`normaliseCues()` handles the two common formats — a flat word list with
timings, or ready-made segments — and groups words into cues of about 2.5
seconds, because a caption on screen longer than that is a wall of text.

With no STT service configured the endpoint says so, and the app falls back to
finding *where* the speech is on the device and letting you type the words. That
is worth having: the timing is the tedious half.

## Before you go live

- [ ] Set `ALLOWED_ORIGINS` in `wrangler.toml`. Empty means it echoes whatever
      origin asks, which is fine locally and too permissive in public.
- [ ] Confirm `PBKDF2_ROUNDS` matches the plan you're on.
- [ ] Send a Stripe test webhook and check a licence row appears.
- [ ] `npm run tail` while you sign up, to see it work once with your own eyes.
