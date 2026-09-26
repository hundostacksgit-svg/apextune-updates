# OmniDx Tune — how it is wired, and what to set up

omnidx.net sells one thing: a PowerShell script that tunes a Windows PC for
games, paid for once, locked to the PC that runs it. This is the map of how the
pieces fit and the short list of what still needs a human to switch on.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| The site | `studio/` (served at `omnidx.net/studio/`, and `omnidx.net` redirects there) | Landing, pricing, run-it, trust and key pages. Black and purple. |
| The bootstrapper | `go.ps1` (served at `omnidx.net/go.ps1`) | The one command: `irm omnidx.net/go.ps1 \| iex`. Asks for the key, gets admin rights, reads `tune/config.json`, fetches the script, runs it from memory. |
| The script | `tune/omnidx.ps1` (served at `omnidx.net/tune/omnidx.ps1`) | The tune itself: read the PC, check the key, restore point, the cut, power plan, network, apps, game profiles, report, undo. Public on purpose. |
| The config | `tune/config.json` | One field that matters: `api`. Empty means no licence server. `version` and `sha256` are stamped by `tools/tune-stamp.py`. |
| On the buyer's PC | `C:\OmniDx\README.txt`, `undo\undo.ps1`, `undo\keep.ps1`, `undo\changes-*.json`; `keep-log.txt`, `after-restart.txt`, `report-*.html`, `summary-*.json` | Written by the script. README.txt explains the folder; undo walks back every record; keep.ps1 is what the sign-in task runs; the log has one line per sign-in. |
| Keys in the browser | `studio/assets/tunekey.js`, `studio/activate/` | The key page: shows the keys the server issued for an order (from Square's redirect, or the receipt number plus the checkout email), sends them again, moves a key. `tunekey.js` only reads a key's checksum, for typos. |
| The owner's page | `studio/admin/`, `POST /v1/tune/admin` | Support from a phone: look up, send again, switch off or on, free a key, totals, a test email, every unsent order. Needs `TUNE_ADMIN_TOKEN`. |
| Terms | `studio/terms/` | Terms, privacy and the all-sales-final policy in plain words; linked from every footer and the key email. |
| The checks | `tools/tune-check.mjs`, `tools/worker-test.mjs`, `tools/site-test.mjs`; `.github/workflows/tune-check.yml`, `pages.yml`, `worker.yml` | Static checks, the licence server offline, the site in a browser (every page, both widths, every link), and the whole tune on a Windows machine; only a copy that passed is what the command fetches. |
| Keys on the server | `server/worker.js` (`/v1/tune/*`), `server/schema.sql` (`tune_keys`, `tune_machines`) | Issues keys against Square orders, binds them to PCs, refuses the rest, moves them on request. |
| Keys by hand | `tools/make-tune-key.py` | Make or check a key; print the D1 insert. |
| Support | `docs/TUNE-SUPPORT.md` | The replies, and where every file lives on the buyer's PC. |
| Promotion | `docs/TUNE-PROMOTION.md` | Bios, hooks, rules, where to post. |
| Transparency | `tools/tune-touches.py` → `studio/what-it-touches/` | The page listing every service, task, app and value, generated from the script. |
| The fresh-install page | `studio/fresh/`, `studio/assets/fresh.js` | Makes `autounattend.xml` in the browser: local account, setup screens skipped, the free look on the desktop at first sign-in, never a disk named. Checked by the browser test (well-formed, three passes, names refused, markup escaped). |
| The undervolt guide | `studio/undervolt/` | GPU and CPU undervolting and frame caps, step by step; nothing to buy. The report's undervolt notes point here. |
| Custom builds, compared | `studio/builds/` | What stripped Windows builds turn off, what it costs, and where the tune stops. No names. |
| The front-page tour | `studio/index.html#tour`, `studio/assets/tour.js` | Eight slides of what a buyer gets, from real artifacts: the published run log, `app.png`, `ci-card.png`. Checked by the browser test. |
| "Watch it work" | `studio/assets/watch.js`, `studio/assets/video/`, made by `tools/promo/tune/` | The 74-second tutorial in a dialog on the front page and the download page: PowerShell, the line, the admin prompt, the fingerprint check, the app, the key, the run, a game's file, the report, undo. Rendered from code (`node tools/promo/tune/render.mjs`); re-cut it when the app's wording changes. Checked by the browser test. |
| The by-hand guide | `studio/guide/` | Everything the tune does, as a list a person can do themselves; nothing to buy on it. The one link that is fine to post in a help thread. |
| The card | `C:\OmniDx\card-<date>.png` on the buyer's PC; `studio/assets/ci-card.png` from the build machine | The before and after on one picture, labelled as one PC's, for posting. Status mode writes one with the after-restart number. |
| The roadmap | `docs/ROADMAP.md` | What was surveyed, what to build next in order, and what was looked at and left alone, with reasons. |
| Prices and links | `studio/assets/config.js` → `TUNE` | The only place a price or a Square link lives. |

The video editor (OmniDx Studio) still lives at `studio/app/` and is linked from
the footer. Nothing about it was removed; the site around it changed.

## The app

The one command opens a window (`-Gui`; `OMNIDX_MODE='console'` for the old
flow). It is WPF drawn from XAML held inside `tune/omnidx.ps1`, so there is
still one file and nothing installed. On load the window starts a second
PowerShell instance running the same script with `-Probe`, which prints the
machine, the advice, the startup entries, the count and the target as one
JSON line; the window fills itself from that. Run starts another instance
with `-Key -Yes -NoRestart -Skip <unticked phases> -Keep <unticked startup
entries>` plus the option switches; its Write-Host lines arrive on the
information stream and a timer moves them into the log. `-Screenshot
<png>` draws the window without showing it; the Windows check does that on
every push and commits the result to `studio/assets/app.png`, which the site
shows. `-SelfTest` proves the script can see its own text and that a
background instance delivers the probe and its log.

The probe also carries `lastRun` (from the newest `summary-*.json`),
`keepOn` and `keyBound`, so on a PC that has run before the window fills
the key box, says "Run it again" on the button and shows the last run's
numbers in the status line. "What is still in place" runs `-Status` in a
background instance. Undo takes two clicks. The "Keep it cut after Windows
updates" box, ticked by default, maps to `-NoKeep` when unticked.

## Money → key → PC, step by step

1. The buyer presses **Get it**. The button's link comes from `TUNE.products.tune.checkout`,
   which is the existing $19.99 Square link. Squad ($39.99, three keys, one PC
   each) uses the existing $39.99 link (the one made as "Studio"). **The $69.99
   Square link is no longer used — delete it in the Square dashboard** so nobody
   pays a price that is not on the site (anyone who does is given Squad).
2. Square takes the money and sends the buyer to the redirect URL set on that
   link: `https://omnidx.net/studio/activate/?e=creator` on the $19.99 link and
   `?e=studio` on the $39.99 one. The activate page maps `creator → tune` and
   `studio → squad` (`TUNE.fromRedirect`), so **nothing in Square has to be
   edited but the item's name**. Square appends its own order id.
3. At the same moment Square calls the Worker's webhook
   (`POST /v1/webhooks/square`, signed with the subscription's signature key
   over the notification URL plus the body). For a completed payment the Worker
   decides the product from the amount, mints the key (three for Squad, rows
   sharing the order reference: plain, `#2`, `#3`), and emails them with the
   one-liner to `buyer_email_address`, the address typed at checkout, via
   Resend. `emailed_at` on the rows stops Square's retries sending it twice.
4. The activate page (`studio/activate/activate.js`) POSTs
   `/v1/tune/issue {product, order}`. The Worker returns the keys already
   minted for that order, or, when the webhook has not arrived yet, confirms
   the order with Square and mints them now (and emails them if Square knows
   the address). One order, one set of keys, whichever call comes first.
   Without `SQUARE_ACCESS_TOKEN` nothing is minted from the page: a key is
   never issued on the strength of a URL.
   Three days after the keys were emailed, the hourly cron sends the order
   its one follow-up (`sweepFollowups`): a key that has not run on a PC gets
   its line again with the free bench to measure first; one that has gets the
   restart, the BIOS checklist, the bench and the Discord. Orders emailed more
   than ten days ago are skipped (switching it on never mails old buyers),
   refunded ones too, and `followup_at` is set before the send, so it never
   goes twice.
5. The page shows the key or the three keys, the one-liner with the first key
   in it, copy buttons for each friend's line, and the steps. The keys are
   saved in that browser; the page shows them again on a return visit, and
   the receipt number from Square's email plus the email paid with gets
   them back on any device (a four-character receipt number could be
   guessed, so it never answers alone; the long order id does). "Send it
   again" under the keys posts the same route with `resend: true`: the
   keys go to the address on file and nowhere else, ten minutes apart,
   and the page says where they went with the address masked. Guessing
   is shut off anyway: twenty tries per connection every ten minutes on
   that route, forty on the claim, ten on a move, sixty on a check, and
   ten wrong owner tokens close the owner page for ten minutes (a right
   token is never counted). The counts live in `tune_hits`, one row per
   connection and window, cleared as windows pass; a database that cannot
   count fails open, so a hiccup on our side never locks a buyer out.
6. The buyer pastes the line. `go.ps1` fetches the verified script, which checks the
   key's checksum, fingerprints the PC (SHA-256 of board serial, system UUID,
   CPU id, first 16 hex chars) and POSTs `/v1/tune/claim {key, hwid, machine}`.
   The Worker binds the key to that PC, or refuses: not issued, refunded, or
   already on another PC. A PC already bound keeps working if the server is
   unreachable.
7. The tune runs. Undo, report and backups land in `C:\OmniDx`.

## Square: exactly what to do

Everything below is in the Square dashboard (squareup.com > Online > Payment
links, or Items & orders > Payment links depending on the layout), and all of
it works from a phone.

1. **Rename the $39.99 link** (`https://square.link/u/sxi62gva`) to
   "OmniDx Tune Squad — three keys". Description: "Three keys, one per PC:
   yours and two to give away. Paid once. The keys appear on the page after
   you pay. Undo in one line."
2. **Rename the $19.99 link** (`https://square.link/u/xm9VtiGc`) to
   "OmniDx Tune — one PC". Description: "One command tunes your Windows PC
   for games. Paid once. Your key appears on the page after you pay; it locks to the first PC that runs it. Undo in one line."
3. **Delete the $69.99 link** (`https://square.link/u/i8zrHwkn`). Nothing
   sells at that price now.
4. **Check each link's redirect URL** ("After payment, send the customer
   to"): `https://omnidx.net/studio/activate/?e=creator` on the $19.99 link
   and `https://omnidx.net/studio/activate/?e=studio` on the $39.99 one. They
   were set up that way; if either is blank, set it. Square appends its own
   order id to that URL and the key page issues the keys against it.
5. **Ask for the buyer's email at checkout** (it is on by default for online
   checkout; the receipt needs it). That address is where the keys go.
6. **The access token** (developer.squareup.com > your application >
   Production > Access token, permissions `ORDERS_READ` and `PAYMENTS_READ`):
   paste it into the repository as the secret `SQUARE_ACCESS_TOKEN`
   (github.com > the repository > Settings > Secrets and variables > Actions).
   The deploy workflow pushes it to the Worker.
7. **The webhook, optional** (developer.squareup.com > your application >
   Webhooks > Add subscription): without it the Worker asks Square about
   refunds on the hour and at every key check, which is enough. With it a
   refund switches the keys off in seconds: URL `https://<the Worker's
   URL>/v1/webhooks/square` (the deploy log's "The Worker answers at" line,
   or `api` in `tune/config.json`), API version the newest, events
   `payment.created`, `payment.updated`, `refund.created` and
   `refund.updated`. Save, then copy the subscription's **Signature key**
   into the repository secret `SQUARE_WEBHOOK_SIGNATURE_KEY` and run the
   deploy once more; it tells the Worker its own address, which the
   signature is computed over.
8. **Do one real test purchase** of the $19.99 link with your own card and
   your own email, confirm the key arrives by email and appears on the page,
   then refund yourself in Square. The refund makes the key stop working
   (see Refunds below).
9. **Receipts**: leave Square's email receipts on. They are the buyer's proof
   and the order number on them is what support asks for.
10. **Payment methods**: make sure Apple Pay, Google Pay, Cash App Pay and
    Afterpay/Klarna are switched on for online payments (Account & Settings >
    Payments). The pricing page lists them.

Prices live in one place, `studio/assets/config.js` (`TUNE.products`). To
change a price: change it in Square, change it there, commit.

## What to switch on

### Going live from a phone: the checklist
Two things to copy, one button, and Square's own pages. No terminal, no DNS
records, no webhook, no mail service. The key shows on the page the buyer
lands on after paying, and the key page shows it again any time. The deploy
finds your Cloudflare account and makes the database itself.

1. **Cloudflare** (dash.cloudflare.com, the free plan): profile icon > My
   Profile > API Tokens > Create Token > the "Edit Cloudflare Workers"
   template > under Permissions add one row, **D1: Edit** > Continue >
   Create Token. Copy it.
2. **Square** (developer.squareup.com > your application > Production):
   copy the **Access token**.
3. **GitHub** (the repository > Settings > Secrets and variables > Actions
   > New repository secret), two secrets, names exactly:
   `CLOUDFLARE_API_TOKEN` (step 1) and `SQUARE_ACCESS_TOKEN` (step 2).
   A third, `TUNE_ADMIN_TOKEN`, is any long password you make up; it
   unlocks the owner page (lost keys, moving a key, switching an order off
   from a phone). Optional: everything a buyer needs works without it.
4. **Deploy**: Actions > "Deploy the Worker" > Run workflow on the branch.
   The run's Summary tab lists every secret and ends with the server's
   health line. The workflow finds the account, makes the `omnidx-studio`
   database if there is none, pushes the secrets, writes the server's
   address into `tune/config.json` and publishes the site.
5. **Square payment links** (squareup.com > Online > Payment links): rename
   the $39.99 link "OmniDx Tune Squad — three keys" and the $19.99 link
   "OmniDx Tune — one PC"; delete the $69.99 link; check the redirects end in
   `?e=creator` ($19.99) and `?e=studio` ($39.99). Where Square's checkout
   settings ask for a refund policy, paste "All sales are final. The key is
   delivered on the page the moment you pay; the free report mode at
   omnidx.net shows every change first." and give
   `https://omnidx.net/studio/terms/` as the terms link. Pictures, where a
   link or the store profile asks for one: the square logo is
   `https://omnidx.net/studio/assets/logo/pfp-800.jpg` and the wide one is
   `https://omnidx.net/studio/assets/logo/banner-1500x500.jpg`.
6. **Test**: buy the $19.99 link with your own card. The key is on the page
   you land on. Refund yourself in Square (the one refund you will ever do);
   within the hour the key stops working (the key page says the order was
   refunded).

Until step 4 is done nobody can buy: the buy buttons say the key desk is
not open, and the key page says the same. Without `SQUARE_ACCESS_TOKEN` the
deploy still runs, and the health line says `square: false`.

Optional, only if you want them: `GMAIL_USER` and `GMAIL_APP_PASSWORD`
(the keys also go to the buyer's checkout email, from your Gmail, and a
"Send it again" button appears on the key page; with these and no
`TUNE_ADMIN_TOKEN`, an owner token is made from the app password and
emailed to that Gmail), `SQUARE_WEBHOOK_SIGNATURE_KEY` (a webhook
subscription in Square's developer dashboard at the Worker's address plus
`/v1/webhooks/square`, events `payment.*` and `refund.*`; refunds then reach
the keys in seconds rather than within the hour), `RESEND_API_KEY` (Resend
instead of Gmail; needs the domain verified with three DNS records),
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_ID` (to pin an account or a
database when the token can see several).

### When something breaks, from a phone
Everything below is the owner page's status line, the Actions tab, or a
dashboard; none of it needs a terminal.

| What you see | What it means | What to do |
| --- | --- | --- |
| Owner page: "Licence server: not answering"; buy buttons closed; key page says the key desk is not open | The Worker is down or was never deployed | Actions > Deploy the Worker > Run workflow. The scheduled run every six hours redeploys on its own when the health check fails. |
| Owner page: "Square: off"; buy buttons closed | `SQUARE_ACCESS_TOKEN` is missing, revoked or expired | Square developer dashboard > Production > new access token; update the repository secret; run the deploy. |
| Keys are on the page but no email arrives; owner page says "Mail through Gmail: on" | Gmail refused the send: the app password was revoked (changing the Google password revokes every app password), 2-Step Verification was turned off, or the day's five hundred are spent. "Send a test email" on the owner page shows Gmail's exact words | Make a new app password, update `GMAIL_APP_PASSWORD`, run the deploy (a new owner token is made and emailed, since it is derived from the app password). Then "Send every unsent order" on the owner page. |
| Owner page says "Mail: off" | Neither `GMAIL_USER` with `GMAIL_APP_PASSWORD` nor `RESEND_API_KEY` is set on the Worker | Set the repository secrets; run the deploy; then "Send every unsent order" on the owner page. Keys still show on the page meanwhile. |
| A refund in Square, but the key still works an hour later | Refunds are checked on the hour (and at every key check) by asking Square; `SQUARE_ACCESS_TOKEN` is missing or expired, or the order was refunded only in part | Owner page: look the order up; a partial refund is your call ("Switch off this key only"); otherwise check the Square token and run the deploy. With the optional webhook set up, refunds land in seconds instead. |
| Square dashboard (webhook set up): deliveries failing with 400 or 503 | The signature key on the Worker is not the subscription's, or the Worker was deployed before the key was set | Re-copy the Signature key into `SQUARE_WEBHOOK_SIGNATURE_KEY`, check the URL ends in `/v1/webhooks/square` on the workers.dev address, run the deploy. Refunds are still checked hourly meanwhile. |
| A buyer says "the key says switched off" and there was no refund | Someone switched it off from the owner page, or a partial refund | Owner page: look it up, "Switch it back on". |
| A buyer paid twice | Two orders, two sets of keys | Refund the second in Square; its keys switch off on their own. |
| A buyer says "too many tries" | Twenty key-page tries from one connection in ten minutes: a retry loop, or a shared connection | Nothing to reset; it passes in ten minutes. Send the keys from the owner page meanwhile. |
| The owner page says "too many tries" | Ten wrong tokens from your connection | Wait ten minutes; check the token you pasted against the repository secret. |
| No Monday email came | Mail is off, `SUPPORT_EMAIL` is not the address you check, or the cron trigger is not on the Worker (an old deploy) | Owner page: "Email me the week" says which; run the deploy so `wrangler.toml`'s `[triggers]` is on the Worker. |
| The owner token leaked | Anyone with it can revoke or resend | Make a new Gmail app password and update `GMAIL_APP_PASSWORD` (the token is made from it), or set your own `TUNE_ADMIN_TOKEN`; run the deploy; the old one stops at once. |
| No owner-token email came after the first deploy | The deploy makes the token only when `GMAIL_APP_PASSWORD` is set, and emails it the first time it lands on the Worker | Run "Deploy the Worker" with "Email me the owner-page token again" ticked. |
| The site shows an old script version in the footer | The newest push has not passed the Windows check yet | Actions > Check the tune: read the failed step. Buyers keep getting the last verified copy, which is the point. |

### The Worker is required to sell
Since 1.29 nothing hands out a key but the Worker, and the Worker hands one
out only after Square confirms the order was paid. Without it the key page
says the key desk is not open, and the script refuses a first run. So the
Worker, with `SQUARE_ACCESS_TOKEN`, is the first thing to switch on; until
then nobody can buy, and nobody can get a key for free either.

Everything the Worker needs is a repository secret, and the deploy workflow
(`.github/workflows/worker.yml`, on every push under `server/` and on the
button) does the rest, so the whole setup is done from a browser:

| Secret | Where it comes from | What it does |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard > My Profile > API Tokens > Create > "Edit Cloudflare Workers" template, plus D1: Edit | lets the workflow deploy; the account is read off it and the `omnidx-studio` database is found or made |
| `SQUARE_ACCESS_TOKEN` | Square developer dashboard > Production access token | confirms orders; asks Square about refunds on the hour and at every key check |
| `TUNE_ADMIN_TOKEN` (optional) | any long password you make up | unlocks the owner page; without it the owner page stays off and everything a buyer needs still works |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` (optional) | the owner's Gmail address and an app password (Google Account > Security > 2-Step Verification > App passwords) | also emails the keys to buyers, from the owner's own address; with no `TUNE_ADMIN_TOKEN`, an owner token is made from the app password and emailed |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` (optional) | Square developer dashboard > Webhooks > the subscription | refunds reach the keys in seconds instead of within the hour |
| `RESEND_API_KEY` (optional) | resend.com > API Keys, after verifying omnidx.net (three DNS records it shows you) | Resend instead of Gmail |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_ID` (optional) | the Cloudflare dashboard | pin an account or database by hand |

After a deploy the workflow finds the Worker's URL, writes it into
`tune/config.json` as `api` (committed with the CI identity, Pages asked to
publish), and, when a webhook key is set, writes `<url>/v1/webhooks/square`
into the Worker's `SQUARE_WEBHOOK_URL`. `GET /v1/health` reports `square`,
`mail` (with `mailer`: `gmail` or `resend`), `refunds` (`webhook` or
`hourly`) and `owner`, which is the quickest way to see what is left, and
`build` and `deployed` (the commit and the minute the deploy workflow put it
up, passed in as plain variables), so the owner page's status line says
which deploy is answering.
Through Gmail the mail leaves from the Gmail address with the display name
from `TUNE_MAIL_FROM` and `SUPPORT_EMAIL` as the reply-to; the Worker speaks
SMTP over TLS to smtp.gmail.com itself (`smtpSend`), five hundred a day is
Gmail's limit. Through Resend the address in `TUNE_MAIL_FROM` must belong to
a domain Resend has verified.
Refunds without a webhook: `refreshRefund` asks Square about an order at
most once an hour, whenever its keys are looked at (the key page, the
script's claim, a check), and the hourly cron (`sweepRefunds`) covers the
orders nobody asked about. A full refund revokes the keys and emails the
buyer; a partial one emails the owner once and changes nothing.

### Support from a phone
`omnidx.net/studio/admin/` (not linked anywhere, `noindex`) is the owner's
page: paste the `TUNE_ADMIN_TOKEN` once (remembered in that browser), then
by Square order reference or by key: **Look up** (the keys, on or off, how
many PCs each is on, the email on file, when the keys were emailed), **Send
the keys again** (to the address on file, or a new one typed in, which then
becomes the address on file), **Free this key from its PC** (the typed key,
or the first of the order; does not spend the buyer's own monthly move),
**Switch the order off**, **Switch it back on**, **Switch off this key
only** (a partial refund of a Squad: type the key), and **Recent orders**
(the last sixty keys grouped by order: product, amount, when, the email,
on or off, emailed or not, under one line of totals since the first sale:
orders, money kept, orders refunded), and **Send a test email** (needs no order: one
short email to the support address or the one typed in, with Resend's own
refusal on screen when the domain is not verified or the from address is
wrong, so mail is proved before the first sale), and **Send every unsent
order** (for the day mail was off or refused while orders came in: each
order marked "not emailed" goes to its checkout address once, and the
ones Resend still refuses are listed; switching off and freeing take two
presses within five seconds, a thumb slips on a phone), and **Email me the week** (the
last seven days and everything since the first sale: orders, money kept,
refunds, keys issued, PCs bound, orders not emailed; the same email
arrives by itself every Monday at 13:00 UTC from the Worker's cron
trigger, `[triggers]` in `wrangler.toml`). All of it is
`POST /v1/tune/admin` on the Worker, refused without the token (403) and
shut when no token is set (503); the offline test covers each action.

### Refunds
The policy is no refunds: the terms page, the pricing page, the key page
and the key email all say all sales are final, and point at the free report
mode as the way to look first. The machinery below stays because Square can
still refund an order without you choosing to (a chargeback or a dispute the
bank decides), and a refunded order's keys must stop working. If you ever
do refund by hand, refund in Square as normal; that is the whole job. A partial refund (one
friend's share of a Squad, say) switches nothing off; the Worker emails
you once, with the amounts and the order reference, and "Switch off this
key only" on the owner page is the usual answer. On the buyer's PC,
`-Status` and `-CheckKey` ask the server (`Get-ServerView`, `/v1/tune/check`)
and say "switched off" in so many words, so a refunded key is never a
mystery. Square sends
`refund.updated` to the webhook, and a completed refund of the full amount
sets `revoked_at` on every key of that order and emails the buyer that the
keys have stopped. The next run on any of those PCs is refused; a PC already
tuned keeps its settings and its undo. A partial refund (one share of a
Squad, say) revokes nothing; decide that one by hand with the command below,
naming the key rather than the order. For a key issued by hand, or with the
webhook not yet set up:

```
npx wrangler d1 execute omnidx-studio --remote --command "UPDATE tune_keys SET revoked_at = strftime('%s','now')*1000 WHERE order_ref = '<square order id>' OR order_ref LIKE '<square order id>#%';"
```

### Moving a key to a new PC
Buyers do it themselves from the key page ("New PC? Move this key") with
their Square order number, once every 30 days: `POST /v1/tune/release`
unbinds every PC from the key and the next PC that runs it becomes its PC.
More often than that, or by hand:
```
npx wrangler d1 execute omnidx-studio --remote --command "DELETE FROM tune_machines WHERE key = '<compact key, no dashes>';"
```

Without the Worker, the new PC simply binds locally; the old PC also keeps
working, which is the honest limit.

### The after-restart count
The number that matters is the one after a restart. The script leaves one
scheduled task ("OmniDx after-restart count") that runs once at the next
sign-in, waits two minutes, writes the count to `C:\OmniDx\after-restart.txt`
and unregisters itself. It is recorded as a change, so undo removes it, and
`-NoAfterCount` skips it. The same line carries the boot time of that start
(event 100 of its boot-performance log, written a few minutes after the
desktop appears; `Get-BootSeconds`); the task waits up to three minutes
more for it after the count. The keep task notes the same figure on each
of its log lines, and status lists those starts, oldest first. The
report and `summary-<date>.json` (`bootBefore`) hold the figure from before
the tune, and status prints the last measured start next to it. It is
Windows' own number, never a stopwatch of ours. The site says so on the run-it, pricing and trust
pages; keep it that way.

### Keeping it cut (the sign-in task)
Windows updates turn pieces of the tune back on: a feature update resets
service start types, re-enables scheduled tasks and puts a few values back.
At the end of a run the script asks "Keep it cut after updates?" (`-Yes`
answers yes, `-NoKeep` or `-Skip keep` never asks). Yes registers one task,
"OmniDx keep", that runs `C:\OmniDx\undo\keep.ps1` hidden three minutes
after that account's sign-in, with a ten-minute limit. keep.ps1 loads every
`changes-*.json` next to it, compares each recorded registry value (the
`value` field, recorded since 1.6), service start type (`now`) and disabled
task with the machine, and sets again whatever drifted. It writes one line
per run to `C:\OmniDx\keep-log.txt`.

What it deliberately leaves alone: startup apps and personal preferences
(`Control Panel`, `StartupApproved`, `Run`, `Explorer\Advanced`, Game Bar,
GameDVR, GPU preferences, visual effects, accessibility). If those change
after the tune it was the buyer, and that wins. The list is `$yours` in
`Get-Drift`; keep.ps1 is written with that function's text pasted in, so
there is one copy of the logic.

The task is recorded as a change, so undo removes it, and undo also removes
it by name. Once undo has moved the records to `undo\done\`, keep.ps1
finds nothing and does nothing. When the administrator password came from
a different account than the one signed in, the task is not made (it would
fire at the wrong sign-in) and the script says so.

`-Status` (`$env:OMNIDX_MODE='status'`) is the read-only side of the same
comparison: the runs recorded, how many settings were checked, what has
drifted, the keep task's state and last line, the after-restart count, the
last run's numbers, the key, and the processes running now that were not
running right after the tune. It needs no administrator rights and runs
from PowerShell 7 too (`go.ps1` does not elevate for `status` or `check`).
The app's "What is still in place" button runs it.

When the keep task puts back five or more settings in one go (a feature
update), it shows one Windows toast notification through PowerShell's own
app id; fewer are fixed quietly. keep-log.txt lines end with the process
count at that sign-in.

`-SupportBundle` (`$env:OMNIDX_MODE='support'`) stages copies of the run
logs, machine and summary JSON, text reports, keep-log, after-restart and
README in `%TEMP%`, masks anything shaped like a key in the text files,
adds the `changes-*.json` records, zips it all to the desktop as
`omnidx-support-<stamp>.zip` and opens Explorer on it. No elevation. The
Windows check runs it after the tune and fails if the bound key appears in
any file of the zip.

The key never travels on a command line: when `go.ps1` has to open an
elevated window it writes the key to a file in the caller's own `%TEMP%`
and passes only that path (`OMNIDX_KEYFILE`); the elevated instance reads
and deletes it. Command lines end up in Windows logs and in the run's
transcript, which is why.

### Extreme
`-Extreme` (`$env:OMNIDX_MODE='extreme'` opens the app with the box ticked)
runs the standard tune and then `Set-Extreme`: the `$script:ExtremeServices`
list (manual, or disabled for the names in `$script:ExtremeOff`; the keep
rules still apply, so a printer keeps its print workflow and a touch screen
its pen service), the shell drawn plain (transparency, animations, shadows,
badges, toasts, the search box), exclusive fullscreen honoured globally,
`OverlayTestMode 5` (multi-plane overlay off), memory compression off with
16 GB or more, `bcdedit /set disabledynamictick yes` on desktops (undo
deletes the value), `SvcHostSplitThresholdInKB` set above the installed RAM
(the service hosts share processes again, as on a PC with under 3.5 GB;
twenty to forty processes fewer after a restart; the keep task holds it, and
`Get-SafeBar` takes 24 off the target while `-Extreme` stands), the shutdown
timeouts at two seconds with `AutoEndTasks` so a stuck app is ended rather
than asked about, `SgrmBroker` off where it exists, and the Xbox
pieces treated as `-CutXbox` unless Game Pass, the Xbox app, Minecraft or a
controller is found (`Test-CutXbox`).
The BIOS checklist gains nine "EXTREME" items. It asks first (`-Yes`
answers yes). The keep task leaves the shell choices alone (`$yours` has
the paths). The key page shows the Extreme command under the standard one,
marked caution, after a purchase. The Windows check runs it as a third pass
then undoes the Extreme run alone with `-UndoLast` (`$env:OMNIDX_MODE='undolast'`:
`undo.ps1 -File <newest record>`, which moves that record to `done\`, points
`changes-latest.json` at the newest remaining run and leaves the keep task
while any run is recorded), checks the two earlier runs are untouched, and
undoes the rest. To drop Extreme but keep the tune, that is the command.

### Decisions made by hand stand
`Get-CutStartup` reads the live `changes-*.json` records for StartupApproved
values and Store-app startup states an earlier run switched off. An entry
that is on again was turned back on in Task Manager: the console lists it
as "stays on" and keeps it (type `all` at the picker to cut those too), the
probe marks it `wasCut` and the app shows it unticked. Undo moves the
records to `done\`, after which nothing counts as cut. The Windows check
turns one entry back on before its second run and requires it to stay on.

### The key is remembered
The first run binds the key under `HKLM:\SOFTWARE\OmniDx\Tune`. Every later
run reads it from there when none is given: the console flow says "Using
the key already bound to this PC", the app fills the key box from the
probe's `keyBound`, and `go.ps1` no longer asks for a key up front except
in `check` mode. `-Key` on the command line still wins, for a moved key.

### Undo across runs
`undo.ps1` with no argument walks back every `changes-*.json` in its folder,
newest first, then moves each to `done\` and deletes `changes-latest.json`;
a second undo says everything has already been put back. `-File` puts back
one record only. A run's `backup\<stamp>` folder is kept as long as its
record is; `Limit-History` keeps the newest ten of everything else.

### Checks that run on every push
The Windows job runs when the push changed `tune/`, `go.ps1`, the Worker
(`server/worker.js`), the test stand-ins, the key tool or the workflow
itself; the `changes` job
diffs the whole push (`github.event.before` to the head), not only its
last commit, so a push of several commits cannot slip a script change past
it. The runner cannot fetch the optional pieces of Windows back from
Windows Update, so the job sets `OMNIDX_SKIP_DISM=1` and undo lists them
for Settings > Apps > Optional features instead of waiting on each; on a
buyer's PC undo tries them, and stops after the first one times out.

The Windows job (about fifteen minutes) runs when the tune, `go.ps1`, the
Worker, the stand-ins, the key tool or the workflow itself changed, and
always from the button; a push that touches only the site gets the static
job and the browser test (in the Pages workflow), which is all it needs. The
`changes` job at the top of `tune-check.yml` decides, from the push's diff.

The licence server the Windows job runs the tune against is the real one:
`tools/worker-serve.mjs` runs `server/worker.js` under Node on the loopback
address, with the stand-in database and Square from
`tools/worker-standin.mjs`, issues one key for a stand-in order at start
(the way the key page does after a payment) and writes it to a file the
steps read. So the script's claim, the second run, Extreme, status and the
key checks all meet the answers a buyer's PC meets, not a stand-in of them.

`node tools/site-test.mjs` drives every Tune page in Chromium at desktop and
phone width (no script or console error, no sideways scroll), then the money
parts against stand-in answers: the buy buttons close with no licence server
and when the server cannot reach Square, and stay open when it merely cannot
be reached from the browser; the key page shows three keys for a Squad order
and one for Tune, shows them again on a return visit, takes the receipt
number with the email paid with (and stops without it), and shows a refusal
in the server's words; the owner page says when the server is off. Then the
key page is driven against the real Worker code (its API calls routed into
`worker.fetch` in the same process, with the stand-ins): a buyer lands from
Square and sees the key the server minted, the email line is absent with no
mailer and present with the Gmail secrets, a resend goes through the fake
Gmail to the address Square holds, and a refund shows as refunded. It runs
in the Pages workflow before anything publishes.

The Windows check serves the tune files from the build machine (LF bytes,
as the site serves them) and runs `go.ps1` against them with
`OMNIDX_BASE=http://127.0.0.1:8090` (the only override `go.ps1` accepts:
127.0.0.1 or localhost): it must report the verified copy's hash matching
and run the report; with both served copies altered by one line it must
say "Could not fetch a good copy" and run nothing.

`node tools/worker-test.mjs` runs the licence server in Node against a
stand-in database and network: a Squad webhook mints three keys and sends one
email, a repeat mints and sends nothing, the key page gets the same keys, a
one-PC order gets one, a bad signature and a payment below the price are
refused, each key locks to one PC, a Squad key moves with the plain
order number, and guessing shuts the door: the twenty-first wrong receipt
number, the eleventh wrong owner token and the forty-first made-up key from
one connection are refused while another connection is served. It runs in the static job of the Windows check and before
every Worker deploy; a statement the Worker sends that the stand-in does not
model fails the run, so a new query needs a line there.

- `tools/tune-check.mjs`: both scripts are ASCII, brackets balance outside
  strings and comments, every function Main calls exists, the key checksum
  agrees between the browser module and the Python tool, config.json's
  version matches the script.
- `tools/tune-touches.py --check`: the "Everything it touches" page is
  generated from the script's lists and fails the build when stale.
- `.github/workflows/tune-check.yml`: on a Windows runner, parses both
  scripts with PowerShell's parser, runs the tune in report mode, draws the
  app window to a PNG, runs undo with nothing recorded, then runs the whole
  tune with a real key, checks `-Status` says everything is in place and
  the keep task is on, turns a service, a task and a policy value back on by
  hand and requires keep.ps1 to see and put back all three, runs the tune a
  second time with the same key (it must be accepted and record at most 20
  new changes: the "run it again, free" promise), undoes both runs (at
  least 70% of the first run's changes must go back, the keep task must be
  gone, both records must be in `done\`), checks status and a second undo
  after that, and confirms a bad key is refused and Python-made keys are
  accepted. The screenshot (`studio/assets/app.png`), the run's numbers
  (`studio/assets/ci-run.json`, read by the proof line on the front and
  trust pages) and the run's log (`studio/assets/ci-log.txt`, shown on the
  run-it page) and the verified copy of the script (`tune/verified.ps1`,
  `tune/verified.json`, the copy `go.ps1` fetches) are committed back to
  the branch by the check itself, which then dispatches the Pages workflow
  so they reach the site at once; never edit any of them by hand. This is the only place the script actually executes before a
  buyer runs it; watch it after every script change.

Two guards in the full-tune step exist because of regressions the logs
caught: the output must show a per-user template service being configured
(`WpnUserService -> manual`), and the run's recorded changes plus the
settings it left alone on purpose (the `already disabled; left that way`
and `already capped` lines) must not fall more than six below the last
published `ci-run.json`'s count; the left-alone count is published as
`leftAlone` and the proof line shows it. A legitimate drop
(say, an image that ships without a service, or a rule that now leaves
something alone, as 1.42.0's "a disabled service stays disabled" did)
means adjusting the guard, never removing it. Diffing `studio/assets/ci-log.txt` between two CI
commits (`git show <prev>:studio/assets/ci-log.txt`) is the quickest way
to see what a change stopped doing.

### A key by hand (Cash App, a friend, a giveaway)
```
python3 tools/make-tune-key.py --sql
```

Give the buyer the key; paste the printed `INSERT` into
`npx wrangler d1 execute omnidx-studio --remote --command "..."` if the Worker
is deployed.

## The lock, honestly

- The checksum stops typos, not people. Anyone can read `tunekey.js` and make a
  key that passes it, which is why a key that passes it gets nobody anything:
  the script asks the Worker, the Worker answers only for keys it minted, and
  it mints only against a Square order it has confirmed. The key page makes
  no keys. `tools/make-tune-key.py` makes keys for the build machine's
  checks and for a giveaway you insert into the database by hand.
- The script is public and readable. Someone determined could save a copy and
  delete the key check. That is a trade made on purpose: a script people can
  read is the reason anyone should run it with administrator rights, and a
  hidden one would sell worse than it protects. The lock exists to keep one
  purchase one purchase, not to fight that person.
- The fingerprint is a hash. It identifies a PC without describing it, and the
  CPU/GPU names sent alongside are only so an owner's machines can be told
  apart in a support email.

## Changing things

- **Price or Square link**: `studio/assets/config.js` → `TUNE.products`. Every
  page reads it (`data-price`, `data-buy`).
- **The menu, drawer or footer**: `tools/build-site.py`, then
  `python3 tools/build-site.py`.
- **The share card**: `tools/promo/tune-og.html`, then
  `python3 -m http.server 8099 &` and `node tools/promo/render-studio-og.mjs`.
- **The script**: `tune/omnidx.ps1`. Bump `$script:Version`, add a card at
  the top of `studio/changelog/index.html` with the same version (the check
  refuses a script whose version is not the changelog's newest), then run
  `python3 tools/tune-stamp.py` (config.json's version and SHA-256; `go.ps1`
  refuses a script that does not match), `python3 tools/tune-touches.py`
  (the transparency page is generated from the script's lists and fails the
  build when stale) and `python3 tools/build-site.py`. `node
  tools/tune-check.mjs` runs every static check. The Windows check parses
  and runs it on every push, and when the whole check passes it commits the
  exact script it tested as `tune/verified.ps1` with its hash, version,
  commit and date in `tune/verified.json`, then dispatches the Pages
  workflow. `go.ps1` fetches `verified.json` first and, when it carries a
  hash, `verified.ps1` checked against it; only when there is no record (or
  it cannot be read) does it fall back to `tune/omnidx.ps1` and the hash in
  `config.json`. So a push reaches everyone on their next run only once the
  Windows check has passed on it; a push that fails the check reaches nobody.
  The static check requires `verified.json` and `verified.ps1` to agree and
  the verified copy to be ASCII with LF endings (the hash is over those
  bytes; the check normalises before hashing, so a CRLF checkout on the
  build machine cannot skew it).
- **A game profile**: add it to `$script:Games` in the script and its name
  to `TUNE.games` in `studio/assets/config.js`; the check requires the two
  counts to agree, and `data-games` on the pages shows the count.
- **A legacy piece of Windows**: `$script:Capabilities` / `$script:Features`
  name it for the report and the transparency page; `$script:CapabilityIds`
  holds the exact DISM package ids the script asks for (listing every
  capability took ninety seconds on the build machine, asking for seven by
  name takes a few). Hello.Face carries a build number, so every one that
  has shipped is listed; when Microsoft ships a new one, add it there.
- **A new kind of recorded change**: add the `Record @{ type = '...' }`, a
  handler in the undo here-string (`$script:UndoScript`), and, if the keep
  task should re-apply it, a branch in `Get-Drift`. The check refuses a
  recorded type with no undo handler.
- **Never by hand**: `studio/assets/app.png`, `studio/assets/ci-run.json`,
  `studio/assets/ci-log.txt`, `tune/verified.ps1`, `tune/verified.json`.
  The Windows check writes them.
- **Key format**: the four checksum lines live in four places —
  `tune/omnidx.ps1`, `studio/assets/tunekey.js`, `server/worker.js`,
  `tools/make-tune-key.py`. Change all four or none.

## Publishing

`.github/workflows/pages.yml` verifies `go.ps1`, `tune/omnidx.ps1`,
`tune/config.json` and the site files on every push, then mirrors the commit to
`gh-pages`. `.github/workflows/worker.yml` deploys the Worker when the
Cloudflare secrets exist.
