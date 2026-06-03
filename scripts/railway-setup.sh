#!/usr/bin/env bash
# One-shot Railway deploy for the Stelvin demo backend.
#
# Run AFTER `railway login` + `railway init` (or `railway link`). This pushes the
# deployed addresses (from .stelvin/testnet.env) and your local stellar identity
# secret keys to the Railway service as env vars, then deploys the Dockerfile.
# Secret keys are read from the local key store and piped straight to Railway —
# never printed here, never committed.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .stelvin/testnet.env ] || { echo "✗ missing .stelvin/testnet.env (run scripts/deploy_and_smoke.sh first)"; exit 1; }
command -v railway >/dev/null 2>&1 || { echo "✗ railway CLI not found (npm i -g @railway/cli)"; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "✗ not logged in — run: railway login"; exit 1; }

set -a; . .stelvin/testnet.env; set +a

echo "→ setting addresses + injected secret keys on the Railway service…"
railway variables \
  --set "ADMIN=$ADMIN" --set "ALICE=$ALICE" --set "BOB=$BOB" --set "MALLORY=$MALLORY" \
  --set "X_SAC=$X_SAC" --set "USDC_SAC=$USDC_SAC" --set "RELAY=$RELAY" --set "GATE=$GATE" \
  --set "BATCH=${BATCH:-1}" --set "R=${R:-0}" \
  --set "ADMIN_SECRET=$(stellar keys secret admin)" \
  --set "ALICE_SECRET=$(stellar keys secret alice)" \
  --set "BOB_SECRET=$(stellar keys secret bob)" \
  --set "MALLORY_SECRET=$(stellar keys secret mallory)"

echo "→ deploying (Dockerfile build on Railway)…"
railway up --detach

echo
echo "✓ deploy started. Next:"
echo "    railway domain        # generate/show the public https URL"
echo "  then point the frontend at it (VITE_DEMO_BACKEND or ?backend=https://…)."
