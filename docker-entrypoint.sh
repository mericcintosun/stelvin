#!/bin/sh
# Runtime bootstrap for the Stelvin demo backend container.
# Reconstructs the stellar CLI config (network + identities) and the settler's
# .stelvin/testnet.env from environment variables, then starts the SSE server.
set -e

# Soroban testnet network alias.
stellar network add testnet \
  --rpc-url "https://soroban-testnet.stellar.org" \
  --network-passphrase "Test SDF Network ; September 2015" 2>/dev/null || true

# Identities from injected secret keys (S...). Written directly to the key store.
ID_DIR="${HOME:-/root}/.config/stellar/identity"
mkdir -p "$ID_DIR"
wid() { [ -n "$2" ] && printf 'secret_key = "%s"\n' "$2" > "$ID_DIR/$1.toml"; }
wid admin "$ADMIN_SECRET"
wid alice "$ALICE_SECRET"
wid bob "$BOB_SECRET"
wid mallory "$MALLORY_SECRET"

# Deployed addresses for the settler (lib.ts reads /app/.stelvin/testnet.env).
mkdir -p /app/.stelvin
cat > /app/.stelvin/testnet.env <<EOF
ADMIN=${ADMIN}
ALICE=${ALICE}
BOB=${BOB}
MALLORY=${MALLORY}
X_SAC=${X_SAC}
USDC_SAC=${USDC_SAC}
RELAY=${RELAY}
GATE=${GATE}
BATCH=${BATCH:-1}
R=${R:-0}
EOF

cd /app/settler && exec npm run server
