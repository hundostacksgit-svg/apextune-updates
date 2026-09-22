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
| The config | `tune/config.json` | One field that matters: `api`. Empty means no licence server. |
| Keys in the browser | `studio/assets/tunekey.js`, `studio/activate/` | Makes and checks keys on the page after paying. |
| Keys on the server | `server/worker.js` (`/v1/tune/*`), `server/schema.sql` (`tune_keys`, `tune_machines`) | Issues keys against Square orders, binds them to PCs, refuses the rest. |
| Keys by hand | `tools/make-tune-key.py` | Make, check or reproduce a key; print the D1 insert. |
| Prices and links | `studio/assets/config.js` → `TUNE` | The only place a price or a Square link lives. |

The video editor (OmniDx Studio) still lives at `studio/app/` and is linked from
the footer. Nothing about it was removed; the site around it changed.

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
```
npx wrangler d1 execute omnidx-studio --remote --command "DELETE FROM tune_machines WHERE key = '<compact key, no dashes>';"
```

Then the next PC that runs it becomes its PC. Without the Worker, the new PC
simply binds locally; the old PC also keeps working, which is the honest limit.

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
- **The script**: `tune/omnidx.ps1`. Bump `$script:Version`. There is no way to
  parse-check PowerShell here, so read a change twice. The one command fetches
  the newest script every run, so a fix reaches everyone on their next run.
- **Key format**: the four checksum lines live in four places —
  `tune/omnidx.ps1`, `studio/assets/tunekey.js`, `server/worker.js`,
  `tools/make-tune-key.py`. Change all four or none.

## Publishing

`.github/workflows/pages.yml` verifies `go.ps1`, `tune/omnidx.ps1`,
`tune/config.json` and the site files on every push, then mirrors the commit to
`gh-pages`. `.github/workflows/worker.yml` deploys the Worker when the
Cloudflare secrets exist.
