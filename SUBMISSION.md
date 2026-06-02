# Stelvin — Build on Stellar (IBW 2026)

**A sealed-bid batch DEX on Soroban: orders are drand-timelock-encrypted and
unreadable — by anyone, including the operator and the settler — until they all
clear at one uniform price. MEV isn't promised away; it's cryptographically
impossible to react to.**

> Tracks: **Main** (automatic) + **Privacy** (primary).

## The "wow", in real numbers (both reproducible)

A single frontrunner bot, run against two markets:

- **Transparent AMM (simulated, real mechanics):** the bot sees one visible
  order in the mempool and sandwiches it → **+315.07 USDC profit; the victim
  loses 268.07 X** to slippage.
- **Stelvin (LIVE on testnet):** the *same bot* pulls the actual on-chain order
  and runs real `tlock` decrypt → **5 attempts, every one "It's too early to
  decrypt … decryptable at round R"** → the drand beacon publishes round R → the
  batch settles on-chain at **one uniform price `P*=0.8`**, both sides fill
  equally (alice +100 X, bob +80 USDC) → **frontrun attempts: 0 successful.**

Run it yourself in ~90s against live testnet: `cd settler && npm run demo`.
A recorded run is in [`demo/sample-run.txt`](./demo/sample-run.txt).

## The problem

On any transparent exchange, the moment you send an order it's visible — bots
jump ahead (frontrunning) and bend the price against you (sandwiching). Billions
are extracted this way every year. A bot can only react to an order it can
**see**. Stelvin makes orders physically invisible until they clear.

## How it works (two layers)

Stelvin protects with **two layers**, and we're precise about what each does:

1. **Timelock encryption** hides order *contents* before reveal. Traders encrypt
   `{side, amount, limit_price}` to a future drand round `R` with `tlock` (BLS12-381
   IBE). No party — not the operator, not the settler — can read an order until
   the drand beacon publishes `R`. The key is held by *no one*; it's produced by a
   live, decentralized beacon. (This is the layer the bot demo proves on-chain.)
2. **Uniform-price batch clearing** removes intra-batch ordering advantage. At `R`
   the whole batch clears at a single price `P*` that the **contract** computes —
   not the settler — so there is no "first in line" edge and the settler can't move
   the price.

**Precise claim:** *intra-batch* frontrunning and sandwiching are
**cryptographically eliminated** — nothing to see before reveal, no ordering edge
at settlement. Cross-batch effects and uniform-auction game theory are ordinary
public-market phenomena, not victim-specific MEV, and we don't claim otherwise.

## Why it matters (and the honest market read)

MEV is a famous, well-documented, multi-billion-dollar harm — but ~99% of it
lives on EVM today, and Stellar DeFi is still small, so realized MEV on Stellar
is marginal *right now*. We don't pretend otherwise. Stelvin's thesis is the
inverse: **proactive, fair-by-default infrastructure.** MEV cost Ethereum
billions precisely *because* protection arrived after the damage. Stellar is
positioned for real-world finance — payroll, settlement, institutional flow —
where fairness is a requirement even at low MEV. Stelvin makes Soroban DeFi
fair *before* MEV scales, using rails (native BLS12-381 host functions + a live
on-chain BLS-verifying drand relay) that only exist here.

## What's genuinely new (no overclaim)

We're **not** the first MEV-resistant or sealed-order design — CoW, Shutter, and
Penumbra exist, and the batch-auction idea is Budish–Cramton–Shim. What is novel
and defensible:

- **First timelock-sealed batch DEX on Soroban / Stellar.**
- **Committee-free:** confidentiality rests on a public drand beacon, not an
  m-of-n keyper committee — no trusted set to collude.
- Built as **one general-purpose Soroban contract** on top of a **live,
  on-chain BLS-verifying** relay — not a bespoke app-chain.

| Project | What it does | How Stelvin differs |
|---|---|---|
| **CoW Protocol** (Ethereum) | Batch auction, uniform clearing; solvers compete off-chain | Same *economic* primitive — but CoW orders are **visible to solvers**; Stelvin hides contents from *everyone* (even the settler) cryptographically. |
| **Penumbra** (Cosmos) | Fully shielded app-chain; batch swaps hide *what* and *who* | More ambitious on privacy (hides counterparties too — Stelvin leaves addresses public). Stelvin is one contract on a general L1, not a dedicated chain. |
| **Shutter** (Ethereum/Gnosis) | Threshold-encrypted mempool; keyper committee unseals after the slot | Same "encrypt then reveal" thesis — but Shutter trusts an **m-of-n committee**; Stelvin uses a **committee-free** drand beacon. |
| **Budish FBA** (academic) | Frequent batch auctions kill the latency race | Stelvin is an implementation of this idea (cited), plus the timelock layer that closes pre-reveal information leakage. |

## Privacy track — mandatory disclosures

- **What is hidden:** order *contents only* — side, amount, limit price.
- **What is NOT hidden (stated up front):** the participant set (trader addresses
  are on-chain in cleartext), the order count per batch, and submission timing.
  Stelvin hides *what* you trade, not *that* you placed an order. Hiding the
  participant graph is future work.
- **From whom:** all participants **and** the operator/settler — until round `R`.
- **Technique:** drand timelock encryption (`tlock` = Boneh-Franklin IBE over
  BLS12-381; `tlock-js`), drand quicknet (`bls-unchained-g1-rfc9380`, 3s period).
- **Threat model:** a mempool-watching frontrunning / sandwich / MEV adversary.
  Pre-`R` there is no plaintext to observe; post-`R` everything clears atomically
  at one price.
- **Cryptographic assumptions:** drand quicknet beacon liveness + BLS signature
  unforgeability. For the on-chain key check we inherit the deployed relay's
  assumptions: `push` is permissionless and runs a full BLS pairing check before
  storing, with no privileged round injection — so even the relay operator can't
  commit a forged round.

## Trust boundary (told up front, not buried)

- **Confidentiality is trustless and temporal** — guaranteed by the timelock
  (secret until `R`, public after), not by any operator's promise.
- **The clearing price is trustless** — computed on-chain by the contract.
- **Settlement integrity is v1-optimistic but publicly auditable** — the settler
  is trusted to decrypt orders correctly and to include them; because `sigma_R`
  is public after `R`, *anyone* can recompute the full decryption and detect a
  misreported or censored order. On-chain enforcement (BLS pairing / fraud proof)
  is roadmap. We do **not** claim trustless on-chain reveal.

## Architecture (one glance)

```
Frontend / settler (TS)        Soroban (Rust)                  drand quicknet
tlock-js encrypt @ R    ──►     BatchGate + Escrow (our work)   (live beacon)
deposit / submit               - opaque ciphertext store              │
                               - standing-balance escrow              │ raw 48B sig
Drand-Relay (live) ──get(R)──► - timing gate + key auth  ◄────────────┘
 = timing/key oracle           - on-chain uniform-price match
 (Kaan Kaçar's; we only call)  - conservation-safe settlement
```

We build the contract, the encryption/settler layer, and the demo. We **only
call** the deployed Drand-Relay (a live, on-chain BLS-verifying oracle by Kaan
Kaçar) as a timing/key oracle — we don't redeploy it. Full rationale (14 ADRs) in
[`DECISIONS.md`](./DECISIONS.md).

## Live & verifiable (every number is real — check it)

Deployed on Stellar **testnet**; judges can inspect on
[stellar.expert](https://stellar.expert/explorer/testnet) or run the scripts.

| Item | Value |
|---|---|
| BatchGate (our contract) | `CBANDFRY6BXQRGRUXIJB6VUZHVH6E4JZIVWBY6JURFRHPWJQ7WT5UOFA` |
| Drand-Relay (oracle, called) | `CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM` |
| Test X / USDC SACs | `CCYIRVXHZUV2XWHZM4G7IGN65PYDQ76GBJTTUAQYENEAIBI6WEMG5BG5` / `CAS6SHC4M3SVTAIPGF2WKM6TDMK76AOTUI65ADXBPRDMI2JFWMQCL2L7` |
| Contract | 12/12 unit tests, wasm 23,723 bytes, `wasm32v1-none` |
| Live M2 settle | round `29197081`, `P*=0.8`, 100 X ↔ 80 USDC |
| Live M5 demo settle | round `29201236`, `P*=0.8`, 5 failed bot reads |
| Sigma encoding | CLI-verified (round `29196000`): `sha256(48B compressed sig)==relay.get(R)` |

**Test it:**
```sh
cargo test -p batch-gate                 # 12/12 contract tests
bash scripts/deploy_and_smoke.sh         # one command: deploy + e2e on testnet
cd settler && npm install && npm run demo # the frontrunner-bot showdown (live)
```

## Status & roadmap

- ✅ **M1** contract (sealed orders, standing-balance escrow, on-chain uniform-price
  matching, conservation-safe + revert-proof settlement, drand timing/key gate).
- ✅ **M2** testnet deploy + one-command end-to-end smoke test.
- ✅ **M3** real `tlock` settler (encrypt → submit → unreadable-pre-`R` → decrypt → settle).
- ✅ **M5** frontrunner-bot demo (transparent-AMM sandwich vs sealed batch).
- ✅ **M4 (Phase A)** web UI (`web/`) — the two panels in the browser, live on
  testnet via an SSE backend (Phase B: wallet-connect + passkey is remaining).
- 🔭 **Roadmap:** on-chain BLS/fraud-proof for settlement; multi-order-per-trader;
  participant-graph privacy; and an **agentic** bidding agent (the settler rails
  already support it) — *not claimed in this submission.*

## Ecosystem fit

- **Composes with Noether** (SCF #41 perpetual DEX, $86.2k funded): after each
  batch settles, Stelvin reads Noether's deployed **SEP-40 on-chain oracle**
  (Oracle Adapter `CBDH7R4PBFHMN4AER74O4RG7VHUWUMFI67UKDIY6ISNQP4H5KFKMSBS4`,
  Band+DIA aggregated, 7-decimal — same scale as our `PRICE_SCALE`) as a live
  **fair-value reference**, e.g. *"Stelvin cleared XLM/USDC within 0.4% of
  Noether's $0.2190 fair value."* **Permissionless, no API key**
  (read-only `--send=no` simulation of `get_price`). It's a **display-only sanity
  check** — Stelvin's price still comes from the sealed orders — and it's
  **strictly non-blocking**: if the oracle is paused/stale/unreachable the demo
  proceeds unchanged and shows *"oracle reference unavailable."*
- **Built directly on Stellar rails:** native Soroban BLS12-381 host functions
  and the live, on-chain BLS-verifying Drand-Relay — the timelock gate exists
  *because* of capabilities unique to this network.

## Tracks

**Main** (automatic) + **Privacy** (primary). Agentic is roadmap, not claimed here.
