# Stelvin settler (M3)

Off-chain settler for Stelvin. Encrypts orders to a future drand round with
[`tlock-js`](https://github.com/drand/tlock-js) (timelock / BLS12-381 IBE),
submits the opaque ciphertext on-chain, then at reveal decrypts the batch and
calls the contract's `settle()`.

> **Encoding contract (proven):** the on-chain key check is
> `sha256(48-byte compressed drand sig) == relay.get(R)`, and that *same* sig is
> the tlock IBE decryption key — one fetch serves both decrypt and settle. See
> `DECISIONS.md` ADR-002. tlock-js 0.9's default chain **is** drand quicknet
> (`52db9ba…`, `bls-unchained-g1-rfc9380`), so `mainnetClient()` is correct.

## Scripts

```sh
npm install

# Step 0 — isolated proof: encrypt to R, fail to decrypt before R, succeed after.
npm run roundtrip

# End-to-end against the live M2 testnet deployment (reads ../.stelvin/testnet.env):
# create batch -> tlock-encrypt + submit -> prove on-chain ciphertext is
# unreadable pre-R -> wait R -> decrypt from chain -> settle -> verify balances.
npm run e2e
```

`e2e` requires a prior `scripts/deploy_and_smoke.sh` run (it reuses the deployed
contract IDs and funded traders in `../.stelvin/testnet.env`).

## Scope (v1)

Core `encrypt → submit → wait → decrypt → settle` round-trip only. A persistent
daemon, retries/idempotency, and multi-batch watching are deliberately out of
scope — they're hardening, not the proof.

## Files

- `src/tlock-roundtrip.ts` — isolated tlock-js quicknet round-trip proof.
- `src/settler.ts` — `encryptOrder` / `decryptHex` + the full on-chain e2e.
