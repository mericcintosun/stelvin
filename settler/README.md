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

# M5 frontrunner-bot demo (two panels, side by side):
npm run demo
```

## The frontrunner-bot demo (`npm run demo`)

Two panels make the value visible (a recorded run is in
[`../demo/demo-run.log`](../demo/demo-run.log)):

- **LEFT — transparent DEX (SIMULATED):** a constant-product AMM sandwich with
  *real* mechanics (front-run → victim slips → back-run). The bot reads alice's
  cleartext order and profits (+315 USDC) while she loses 268 X to slippage.
  Clearly labeled a simulation — sandwiching AMMs is exactly how real MEV works.
- **RIGHT — Stelvin (LIVE on testnet):** the *same bot* pulls the actual on-chain
  ciphertext and really runs `tlock` decrypt — and gets *"It's too early to
  decrypt … decryptable at round R"* on every attempt, with a live countdown,
  until the drand beacon publishes R. Then the batch settles at a single uniform
  price and everyone fills equally. Frontrun attempts: all failed.

**Honesty framing (also on screen).** Stelvin protects with **two layers**:
(1) **timelock** hides order contents before reveal; (2) **uniform-price batch
clearing** removes intra-batch ordering advantage. *Why timelock on top of a
batch auction?* A batch auction removes ordering advantage at settlement, but
pre-settlement order contents would still leak strategy (copy-trading,
positioning). Timelock closes that pre-reveal leak. Together: nothing to see,
nothing to exploit. The LEFT panel is a labeled simulation; the RIGHT panel is
live, with the bot genuinely failing to decrypt — not a scripted "access denied".

`e2e` requires a prior `scripts/deploy_and_smoke.sh` run (it reuses the deployed
contract IDs and funded traders in `../.stelvin/testnet.env`).

## Scope (v1)

Core `encrypt → submit → wait → decrypt → settle` round-trip only. A persistent
daemon, retries/idempotency, and multi-batch watching are deliberately out of
scope — they're hardening, not the proof.

## Files

- `src/lib.ts` — shared chain + tlock helpers.
- `src/tlock-roundtrip.ts` — isolated tlock-js quicknet round-trip proof.
- `src/settler.ts` — the full on-chain encrypt → submit → decrypt → settle e2e.
- `src/frontrunner-bot.ts` — the two-panel M5 demo.
