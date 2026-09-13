#!/usr/bin/env bash
#
# Deploy the OmniDx Studio API in one command.
#
#   cd server && ./deploy.sh
#
# First run walks you through it. Later runs just deploy. Everything it needs
# is either asked for or read from what you set last time.

set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }

command -v npx >/dev/null || { echo "Node is needed. Install it from nodejs.org, then run this again."; exit 1; }

if [ ! -d node_modules ]; then
  say "Installing dependencies…"
  npm install --no-audit --no-fund
fi

if grep -q 'PASTE_YOUR_DATABASE_ID_HERE' wrangler.toml; then
  say "You do not have a database yet. Making one…"

  # The id is captured and written in, rather than printed for you to copy.
  #
  # This was the one step that turned "run this script" into "run this script,
  # read the output, find the right line, edit a config file, run it again" —
  # and the step people give up on, because it is the only one that asks you to
  # understand the thing you are trying to avoid understanding.
  out="$(npx wrangler d1 create omnidx-studio 2>&1 || true)"
  printf '%s\n' "$out"

  # wrangler has printed this id in several shapes over the years, so match the
  # id itself rather than the sentence around it.
  id="$(printf '%s' "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"

  if [ -z "$id" ]; then
    # Perhaps it already existed. Ask wrangler what it knows.
    id="$(npx wrangler d1 list --json 2>/dev/null \
      | grep -B3 -i '"name": *"omnidx-studio"' \
      | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  fi

  if [ -z "$id" ]; then
    warn "Could not read the database id from wrangler's output."
    warn "Paste it into wrangler.toml where it says PASTE_YOUR_DATABASE_ID_HERE, then run this again."
    exit 1
  fi

  # A backup before editing, because this is somebody's live configuration.
  cp wrangler.toml wrangler.toml.bak
  if sed --version >/dev/null 2>&1; then
    sed -i "s/PASTE_YOUR_DATABASE_ID_HERE/$id/" wrangler.toml      # GNU
  else
    sed -i '' "s/PASTE_YOUR_DATABASE_ID_HERE/$id/" wrangler.toml   # BSD / macOS
  fi
  say "Database ready — id written into wrangler.toml. Carrying on."
fi

say "Creating any missing tables…"
npx wrangler d1 execute omnidx-studio --file=schema.sql --remote --yes

# Secrets are only asked for once. wrangler keeps them; this never stores them.
for secret in ANTHROPIC_API_KEY STRIPE_WEBHOOK_SECRET RESEND_API_KEY; do
  if ! npx wrangler secret list 2>/dev/null | grep -q "\"$secret\""; then
    case "$secret" in
      ANTHROPIC_API_KEY)     warn "ANTHROPIC_API_KEY is not set — the cloud AI planner will be off." ;;
      STRIPE_WEBHOOK_SECRET) warn "STRIPE_WEBHOOK_SECRET is not set — licences will not be issued automatically." ;;
      RESEND_API_KEY)        warn "RESEND_API_KEY is not set — licence keys will not be emailed." ;;
    esac
    read -r -p "Set $secret now? [y/N] " answer
    [ "${answer:-n}" = "y" ] && npx wrangler secret put "$secret"
  fi
done

say "Deploying…"
npx wrangler deploy

say "Checking it answers…"
url="$(npx wrangler deployments list 2>/dev/null | grep -o 'https://[^ ]*workers.dev' | head -1 || true)"
if [ -n "$url" ]; then
  curl -fsS --max-time 20 "$url/v1/health" && echo
  say "Live at $url"
  echo
  echo "ONE THING LEFT. The app does not know about this yet, so it is still"
  echo "running on the offline reader — which is why the AI can only follow"
  echo "direct instructions rather than anything you type."
  echo
  echo "  For just this device:  open the app, Settings → Cloud brain → Worker URL"
  echo "  For everybody:         set DEFAULT_API_BASE in studio/assets/config.js to"
  echo "                         $url"
  echo "                         then commit and push."
  echo
  if npx wrangler secret list 2>/dev/null | grep -q ANTHROPIC_API_KEY; then
    echo "The AI key is set, so full language understanding switches on the moment"
    echo "you do that."
  else
    warn "No ANTHROPIC_API_KEY is set, so the AI endpoint will answer 503."
    echo "Run: npx wrangler secret put ANTHROPIC_API_KEY"
  fi
else
  warn "Deployed. Find the URL in your Cloudflare dashboard under Workers."
fi
