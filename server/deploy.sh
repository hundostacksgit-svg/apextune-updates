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
  npx wrangler d1 create omnidx-studio || true
  warn "Copy the database_id it printed into wrangler.toml, then run this again."
  exit 1
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
  echo "Put that in the app: Settings → Cloud brain → Worker URL"
  echo "Or set DEFAULT_API_BASE in studio/assets/config.js so every copy uses it."
else
  warn "Deployed. Find the URL in your Cloudflare dashboard under Workers."
fi
