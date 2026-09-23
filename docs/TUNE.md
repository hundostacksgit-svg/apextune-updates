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
| Keys in the browser | `studio/assets/tunekey.js`, `studio/activate/` | Makes and checks keys on the page after paying. |
| Keys on the server | `server/worker.js` (`/v1/tune/*`), `server/schema.sql` (`tune_keys`, `tune_machines`) | Issues keys against Square orders, binds them to PCs, refuses the rest, moves them on request. |
| Keys by hand | `tools/make-tune-key.py` | Make, check or reproduce a key; print the D1 insert. |
| Support | `docs/TUNE-SUPPORT.md` | The replies, and where every file lives on the buyer's PC. |
| Promotion | `docs/TUNE-PROMOTION.md` | Bios, hooks, rules, where to post. |
| Transparency | `tools/tune-touches.py` → `studio/what-it-touches/` | The page listing every service, task, app and value, generated from the script. |
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
   which is the existing $19.99 Square link. Squad ($69.99, five PCs) uses the
   existing $69.99 link. **The $39.99 Square link is no longer used — delete it in
   the Square dashboard** so nobody can pay a price that buys nothing.
2. Square takes the money and sends the buyer to the redirect URL set on that
   link. Those were set up as `https://omnidx.net/studio/activate/?e=creator`
   and `?e=team`; the activate page maps `creator → tune` and `team → squad`, so
   **nothing in Square has to be edited**. Square appends its own order id.
3. The activate page (`studio/activate/activate.js`) gets a key for that order:
   - **Worker deployed** (`tune/config.json` has `api`): it POSTs
     `/v1/tune/issue {product, order}`. The Worker returns one key per order —
     a refresh gets the same key back — and records it. With
     `SQUARE_ACCESS_TOKEN` set, the Worker first asks Square whether that order
     really completed and for how much, and decides the product from the amount.
   - **No Worker**: the key is derived from the order reference in the browser
     (`keyForOrder`), so the same receipt always gives the same key.
     `python3 tools/make-tune-key.py --order <ref>` reproduces it for support.
4. The page shows the key, the one-liner with the key already in it, and the
   steps. The key is saved in that browser; the page shows it again on a return
   visit. No email is sent (there is no email address to send it to — Square
   does not pass one on the redirect).
5. The buyer pastes the line. `go.ps1` fetches the script, which checks the
   key's checksum, fingerprints the PC (SHA-256 of board serial, system UUID,
   CPU id, first 16 hex chars) and then:
   - **Worker deployed**: POSTs `/v1/tune/claim {key, hwid, machine}`. The Worker
     binds the key to that PC (up to `seats`), or refuses: not issued, refunded,
     or already on another PC. A PC already bound keeps working if the server
     is unreachable.
   - **No Worker**: the key and fingerprint are written to
     `HKLM:\SOFTWARE\OmniDx\Tune`; a different key on the same PC is refused.
6. The tune runs. Undo, report and backups land in `C:\OmniDx`.

## Square: exactly what to do

Everything below is in the Square dashboard (squareup.com > Online > Payment
links, or Items & orders > Payment links depending on the layout).

1. **Delete the $39.99 link** (`https://square.link/u/sxi62gva`). Nothing
   sells at that price now; a visitor who somehow pays it would get a
   one-PC key and a confusing receipt.
2. **Rename the $19.99 link** (`https://square.link/u/xm9VtiGc`) to
   "OmniDx Tune — one PC". Description: "One command tunes your Windows PC
   for games. Paid once. Your key appears on the page after you pay; it
   locks to the first PC that runs it. Undo in one line."
3. **Rename the $69.99 link** (`https://square.link/u/i8zrHwkn`) to
   "OmniDx Tune Squad — five PCs". Description: "The same tune on five PCs,
   one key."
4. **Check each link's redirect URL** ("After payment, send the customer
   to"): `https://omnidx.net/studio/activate/?e=creator` on the $19.99 link
   and `https://omnidx.net/studio/activate/?e=team` on the $69.99 one. They
   were set up that way; if either is blank, set it. Square appends its own
   order id to that URL and the key page issues the key against it.
5. **Do one real test purchase** of the $19.99 link with your own card, note
   the exact URL you land on (it should contain an order or transaction id),
   confirm the key appears, then refund yourself in Square. If the URL
   arrives with no id, the key page asks for the receipt number instead and
   still works; tell me and I will match whatever Square actually sends.
6. **Receipts**: leave Square's email receipts on. They are the buyer's proof
   and the order number on them is what support asks for.
7. **Payment methods**: make sure Apple Pay, Google Pay, Cash App Pay and
   Afterpay/Klarna are switched on for online payments (Account & Settings >
   Payments). The pricing page lists them.
8. **Optional, for the Worker**: Developer dashboard (developer.squareup.com)
   > your application > Production > Access token. Give it `ORDERS_READ` and
   `PAYMENTS_READ`, then `npx wrangler secret put SQUARE_ACCESS_TOKEN` in
   `server/`. From then on every key is issued only against a completed
   Square order, and the amount paid decides Tune or Squad.

Prices live in one place, `studio/assets/config.js` (`TUNE.products`). To
change a price: change it in Square, change it there, commit.

## What to switch on

### Nothing, to sell today
The site, the key page and the script work with no server. Keys are checked by
checksum and locked locally. This is the same strength the Studio activation
page had: it trusts Square's redirect.

### The Worker, to make keys real
Deploying `server/` is what makes "one key, one PC" enforceable and lets a
refund actually stop a key.

1. Set the three repository secrets `.github/workflows/worker.yml` names
   (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_ID`). The
   workflow creates the tables (`schema.sql` is all `IF NOT EXISTS`) and deploys.
2. Put the Worker URL in `tune/config.json` as `api` and commit. Both the key
   page and `go.ps1` read that file, so that one edit switches everything.
3. Optional, recommended: `npx wrangler secret put SQUARE_ACCESS_TOKEN` with a
   Square access token that can read orders and payments. From then on
   `/v1/tune/issue` confirms every order with Square before minting, and a
   `?e=team` on a $19.99 order gets a one-PC key.

`GET /v1/health` reports `square: true` when the token is set.

### Refunds
Refund in Square as normal, then:

```
npx wrangler d1 execute omnidx-studio --remote --command "UPDATE tune_keys SET revoked_at = strftime('%s','now')*1000 WHERE order_ref = '<square order id>';"
```

The next run on that PC is refused. Without the Worker there is nothing to
revoke; the key keeps working on the PC it is bound to.

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
`-NoAfterCount` skips it. The site says so on the run-it, pricing and trust
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

The key never travels on a command line: when `go.ps1` has to open an
elevated window it writes the key to a file in the caller's own `%TEMP%`
and passes only that path (`OMNIDX_KEYFILE`); the elevated instance reads
and deletes it. Command lines end up in Windows logs and in the run's
transcript, which is why.

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
  run-it page) are committed back to the branch by the check itself; never
  edit those three by hand. This is the only place the script actually executes before a
  buyer runs it; watch it after every script change.

### A key by hand (Cash App, a friend, a giveaway)
```
python3 tools/make-tune-key.py --sql
```

Give the buyer the key; paste the printed `INSERT` into
`npx wrangler d1 execute omnidx-studio --remote --command "..."` if the Worker
is deployed.

## The lock, honestly

- The checksum stops typos, not people. Anyone can read `tunekey.js` and make a
  key that passes it. **The Worker is what makes a key real.**
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
- **The script**: `tune/omnidx.ps1`. Bump `$script:Version`, then run
  `python3 tools/tune-stamp.py` so `tune/config.json` carries the new version
  and SHA-256 (`go.ps1` refuses a script that does not match, and the publish
  check refuses a stale stamp). The Windows check parses and runs it on every
  push. The one command fetches the newest script every run, so a fix reaches
  everyone on their next run.
- **Key format**: the four checksum lines live in four places —
  `tune/omnidx.ps1`, `studio/assets/tunekey.js`, `server/worker.js`,
  `tools/make-tune-key.py`. Change all four or none.

## Publishing

`.github/workflows/pages.yml` verifies `go.ps1`, `tune/omnidx.ps1`,
`tune/config.json` and the site files on every push, then mirrors the commit to
`gh-pages`. `.github/workflows/worker.yml` deploys the Worker when the
Cloudflare secrets exist.
