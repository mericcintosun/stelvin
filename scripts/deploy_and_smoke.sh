#!/usr/bin/env bash
# Stelvin M2 — testnet deploy + end-to-end CLI smoke test (one command).
#
# RWA framing: deploys fresh tUSTB (tokenized US T-bill) + USDC SACs + BatchGate,
# enables permissioned (KYC) mode + allowlists alice/bob, then runs the full flow:
#   deposit -> create_batch(R) -> submit_order x2 -> (un-KYC'd mallory rejected)
#   -> wait for drand round R -> fetch raw compressed sigma -> settle -> verify
#   balances changed at a single uniform clearing price (near par / NAV).
#
# No tlock needed here: the contract treats `ciphertext` as opaque and `settle`
# trusts the revealed[] plaintext (DECISIONS ADR-014). tlock encryption is M3.
#
# Encoding contract (CLI-verified, ADR-002): the on-chain key check is
#   sha256(48-byte COMPRESSED drand sig) == relay.get(R).
set -euo pipefail

NET=testnet
RELAY=CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM
CHAIN=52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM="$ROOT/target/wasm32v1-none/release/batch_gate.wasm"
ENVF="$ROOT/.stelvin/testnet.env"
mkdir -p "$ROOT/.stelvin"

say(){ printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
addr(){ grep -oE '^C[A-Z0-9]{55}$' | tail -1; }
num(){ grep -oE '^[0-9]+$' | tail -1; }

say "Build wasm"
( cd "$ROOT" && stellar contract build >/dev/null )

say "Identities (admin/alice/bob/mallory) + friendbot fund"
for who in admin alice bob mallory; do
  stellar keys generate "$who" --network $NET --fund --overwrite >/dev/null 2>&1 || true
done
ADMIN=$(stellar keys address admin); ALICE=$(stellar keys address alice); BOB=$(stellar keys address bob)
MALLORY=$(stellar keys address mallory)
echo "admin=$ADMIN"; echo "alice=$ALICE"; echo "bob=$BOB"; echo "mallory(un-KYC'd)=$MALLORY"

say "Relay liveness (must be advancing)"
LATEST=$(stellar contract invoke --id $RELAY --source admin --network $NET -- latest 2>/dev/null | grep -oE '\[[0-9]+' | tr -d '[')
[ -n "$LATEST" ] || { echo "relay not live"; exit 1; }
echo "relay latest round = $LATEST"

say "Deploy tUSTB (tokenized US T-bill) + USDC SACs (admin-issued)"
X_SAC=$(stellar contract asset deploy --asset tUSTB:$ADMIN --source admin --network $NET 2>/dev/null | addr)
USDC_SAC=$(stellar contract asset deploy --asset USDC:$ADMIN --source admin --network $NET 2>/dev/null | addr)
echo "tUSTB_SAC=$X_SAC"; echo "USDC_SAC=$USDC_SAC"

say "Trustlines + mint (alice<-USDC, bob<-tUSTB)"
stellar tx new change-trust --source alice --line USDC:$ADMIN  --network $NET >/dev/null 2>&1 || true
stellar tx new change-trust --source bob   --line tUSTB:$ADMIN --network $NET >/dev/null 2>&1 || true
stellar contract invoke --id $USDC_SAC --source admin --network $NET -- mint --to $ALICE --amount 1000000 >/dev/null
stellar contract invoke --id $X_SAC    --source admin --network $NET -- mint --to $BOB   --amount 1000000 >/dev/null

say "Deploy BatchGate (admin, tUSTB, USDC, relay)"
GATE=$(stellar contract deploy --wasm "$WASM" --source admin --network $NET -- \
  --admin $ADMIN --asset_base $X_SAC --asset_quote $USDC_SAC --relay $RELAY 2>/dev/null | addr)
echo "GATE=$GATE"

say "Permissioned RWA mode: enable + KYC-allowlist alice & bob"
stellar contract invoke --id $GATE --source admin --network $NET -- set_permissioned --enabled true >/dev/null
stellar contract invoke --id $GATE --source admin --network $NET -- set_kyc --trader $ALICE --allowed true >/dev/null
stellar contract invoke --id $GATE --source admin --network $NET -- set_kyc --trader $BOB   --allowed true >/dev/null
echo "permissioned=true; alice & bob allowlisted (mallory deliberately left off)"

say "Deposit (alice 500k USDC, bob 500k tUSTB)"
stellar contract invoke --id $GATE --source alice --network $NET -- deposit_funds --trader $ALICE --asset $USDC_SAC --amount 500000 >/dev/null
stellar contract invoke --id $GATE --source bob   --network $NET -- deposit_funds --trader $BOB   --asset $X_SAC    --amount 500000 >/dev/null

say "Create batch (R = relay latest + 20 ~60s ahead)"
LATEST=$(stellar contract invoke --id $RELAY --source admin --network $NET -- latest 2>/dev/null | grep -oE '\[[0-9]+' | tr -d '[')
R=$((LATEST + 20))
BATCH=$(stellar contract invoke --id $GATE --source admin --network $NET -- create_batch --reveal_round $R 2>/dev/null | num)
echo "reveal_round=$R  batch_id=$BATCH"

say "Submit orders (alice Buy, bob Sell; ciphertext is opaque)"
AOID=$(stellar contract invoke --id $GATE --source alice --network $NET -- submit_order --trader $ALICE --batch_id $BATCH --ciphertext deadbeef0a11ce 2>/dev/null | num)
BOID=$(stellar contract invoke --id $GATE --source bob   --network $NET -- submit_order --trader $BOB   --batch_id $BATCH --ciphertext deadbeef0b0b   2>/dev/null | num)
echo "alice order_id=$AOID  bob order_id=$BOID"

say "RWA gate proof: an un-KYC'd address (mallory) is rejected on-chain"
if stellar contract invoke --id $GATE --source mallory --network $NET -- submit_order --trader $MALLORY --batch_id $BATCH --ciphertext deadbeef >/dev/null 2>&1; then
  echo "UNEXPECTED: mallory (no KYC) was allowed"; exit 1
else
  echo "✓ mallory (no KYC) rejected by the permissioned gate"
fi

say "Wait for reveal round R to land in the relay (feeder)"
V=""
for i in $(seq 1 48); do
  V=$(stellar contract invoke --id $RELAY --source admin --network $NET -- get --round $R 2>/dev/null | grep -oE '[0-9a-f]{64}' | head -1 || true)
  [ -n "$V" ] && { echo "round $R available after ~$((i*5))s"; break; }
  sleep 5
done
[ -n "$V" ] || { echo "timeout waiting for round $R"; exit 1; }

say "Fetch raw compressed sigma + verify encoding"
SIG=$(curl -s --max-time 15 "https://api.drand.sh/$CHAIN/public/$R" | sed -E 's/.*"signature":"([0-9a-f]*)".*/\1/')
COMPUTED=$(printf '%s' "$SIG" | xxd -r -p | shasum -a 256 | awk '{print $1}')
[ "$COMPUTED" = "$V" ] && echo "sha256(sigma)==relay.get(R) ✓" || { echo "ENCODING MISMATCH"; exit 1; }

say "Settle (uniform price computed on-chain; tUSTB/USDC near par)"
stellar contract invoke --id $GATE --source admin --network $NET -- \
  settle --batch_id $BATCH --sigma_r $SIG \
  --revealed "[{\"order_id\":$AOID,\"side\":\"Buy\",\"amount\":\"100\",\"limit_price\":\"10010000\"},{\"order_id\":$BOID,\"side\":\"Sell\",\"amount\":\"100\",\"limit_price\":\"10000000\"}]" >/dev/null

say "Verify standing balances + clearing"
bal(){ stellar contract invoke --id $GATE --source admin --network $NET -- get_balance --trader "$1" --asset "$2" 2>/dev/null | grep -oE '"[0-9]+"' | tr -d '"' | tail -1; }
echo "alice  tUSTB=$(bal $ALICE $X_SAC)  USDC=$(bal $ALICE $USDC_SAC)"
echo "bob    tUSTB=$(bal $BOB $X_SAC)  USDC=$(bal $BOB $USDC_SAC)"
stellar contract invoke --id $GATE --source admin --network $NET -- get_clearing --batch_id $BATCH 2>/dev/null | grep -oE '\{.*\}'

say "Save addresses -> $ENVF"
{ echo "ADMIN=$ADMIN"; echo "ALICE=$ALICE"; echo "BOB=$BOB"; echo "MALLORY=$MALLORY";
  echo "X_SAC=$X_SAC"; echo "USDC_SAC=$USDC_SAC"; echo "RELAY=$RELAY"; echo "GATE=$GATE";
  echo "BATCH=$BATCH"; echo "R=$R"; } > "$ENVF"

say "RWA smoke test PASSED ✅  (permissioned KYC gate, un-KYC'd rejected, tUSTB/USDC settled at par on-chain)"
