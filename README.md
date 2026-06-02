# Stelvin

**MEV-resistant, sealed-bid batch auction on Stellar Soroban.**

Traders submit orders that are **drand-timelock-encrypted** — physically
unreadable by anyone, including the operator and the settler, until a committed
drand round `R`. At `R` the whole batch is revealed and clears at a **single
uniform price computed on-chain**. Because no one can see an order before it
clears, a frontrunner has nothing to react to: MEV isn't promised away, it's
**cryptographically zero**.

> Tracks: **Main** (automatic) + **Privacy** (primary). Built for Build on
> Stellar — IBW 2026.

## Why

On a normal exchange, the moment you send an order, bots see it, jump ahead
(frontrunning) and bend the price against you (sandwiching) — billions extracted
per year. A bot can only react to an order it can *see*. Stelvin makes orders
invisible until reveal, so there is nothing to frontrun. The guarantee is
temporal and cryptographic: hidden until `R`, public after, by construction.

## Architecture

| Layer | What | Tech |
|---|---|---|
| **Contract** | BatchGate + Escrow: sealed orders, standing-balance escrow, timing/key gate, on-chain uniform-price matching, conservation-safe settlement | Rust / Soroban |
| **Encryption** | encrypt-to-round (timelock) | `tlock-js` (BLS12-381 IBE, drand quicknet) |
| **Settler** | fetch raw `sigma_R` → decrypt batch → `settle()` | TypeScript |
| **Oracle (external)** | timing + key authenticity | [Drand-Relay](./Drand-Relay) (deployed; we only call it) |

The contract lives in [`contracts/batch-gate`](./contracts/batch-gate). Full
rationale, trade-offs, threat model, and milestones are in
[`DECISIONS.md`](./DECISIONS.md).

## Status

- ✅ **Contract** — `__constructor`, `deposit_funds`/`withdraw`, `create_batch`,
  `submit_order`, `lock_batch`, `settle` + on-chain matching, reveal dedup,
  one-order-per-trader guard, lifecycle events. 12/12 unit tests (incl.
  conservation + no-revert + dedup). Wasm builds (~23.7 KB, `wasm32v1-none`).
- ✅ **Testnet (M2)** — deployed against the live Drand-Relay; one-command
  end-to-end smoke test (`scripts/deploy_and_smoke.sh`): deposit → create batch →
  sealed submit → drand round publishes → fetch sigma → settle → balances change
  at the uniform clearing price. Encoding (`sha256(48-byte compressed sigma) ==
  relay.get(R)`) CLI-verified.
- ✅ **Settler (M3)** — [`settler/`](./settler): real `tlock-js` encrypt → submit →
  (on-chain ciphertext **unreadable before round R**) → decrypt at reveal → settle,
  verified end-to-end on testnet.
- ⏳ Frontend · frontrunner-bot demo · docs.

## Build & test

```sh
# unit tests
cargo test -p batch-gate

# release wasm
stellar contract build
```

## Privacy disclosures (track requirement)

- **Hidden:** order contents (side, amount, limit price).
- **From whom:** all participants and the operator/settler — until round `R`.
- **Technique:** drand timelock encryption (`tlock`, Boneh-Franklin IBE / BLS12-381).
- **Threat model:** mempool-watching frontrunning / sandwich / MEV adversary.
- **Assumptions:** drand quicknet liveness + BLS unforgeability.

See [`DECISIONS.md` §6](./DECISIONS.md) for the full, honest treatment including
the trusted-settler caveat (decrypt correctness is v1-optimistic; confidentiality
is trustless).

## Acknowledgements

[`Drand-Relay/`](./Drand-Relay) is vendored reference code by **Kaan Kaçar** —
a live, on-chain BLS-verifying drand oracle that Stelvin uses purely as a
timing/key oracle. We do not redeploy it; see its own README for attribution.
