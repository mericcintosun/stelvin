# Stelvin — Build on Stellar (IBW 2026)

**A sealed-bid batch DEX on Soroban: orders are drand-timelock-encrypted and
unreadable by anyone (operator and settler included) until they all clear at one
uniform price. Fair execution for Stellar DeFi traders today; the on-chain dark
pool for tokenized-RWA & institutional flows next. MEV isn't promised away; it's
cryptographically impossible to react to.**

> Tracks: **Main** (automatic) + **Privacy** (primary).

## Judging at a glance (criterion → evidence)

| Criterion | Where we satisfy it |
|---|---|
| **Idea & real-world impact** | Provable MEV victim (sandwiching, ~1.2% of DEX trades) → §_Why it matters_, §_Real-world use case_; honest market read + CoW comp → §_Market & Business Model_ |
| **Technical implementation** | 25/25 unit tests (conservation + revert-proof + KYC + fee + overflow caps + randomized property test); live on testnet; one-command e2e (`deploy_and_smoke.sh`); design rationale in `DECISIONS.md` (19 ADRs) |
| **User experience** | Two-panel live showdown (sandwich vs sealed batch) + venue framing; feeder-resilient demo (auto-retry); read-only wallet connect |
| **Ecosystem fit** | Composes a live on-chain BLS-verifying Drand-Relay + Noether SEP-40 oracle; native Soroban storage/auth/SAC; stellar CLI + RPC; `tlock-js` |
| **Presentation & docs** | This file + `README.md` + `DECISIONS.md` + in-app `/docs`; lifecycle/adversary diagram; `demo/DEMO_SCRIPT.md` |
| **Privacy side-track** | Disclosures (hidden / from-whom / technique / threat model / assumptions) → §_Privacy track_; **public auditor** artifact (`npm run verify`) |

## The "wow", in real numbers (both reproducible)

A single frontrunner bot, run against two markets — an institutional **tUSTB/USDC**
(tokenized US T-bill) block trade:

- **Transparent AMM (simulated, real mechanics):** the bot sees one visible block
  order on a transparent venue and sandwiches it → **+315.07 USDC profit; the desk
  loses 268.07 tUSTB** to slippage.
- **Stelvin (LIVE on testnet):** the contract runs in **permissioned (KYC) mode** —
  the desks are allowlisted and an un-KYC'd address is rejected on-chain. The *same
  bot* pulls the actual on-chain order and runs real `tlock` decrypt → **every
  attempt "It's too early to decrypt … decryptable at round R"** → the drand beacon
  publishes round R → the batch settles on-chain at **one uniform price `P*=1.00`
  (at par/NAV)** — a 10,000-unit block fills equally (alice +10,000 tUSTB, bob
  +9,998 USDC net of a **2 bps venue fee**; 2 USDC accrues to the protocol and is
  withdrawn) → **frontrun attempts: 0 successful.**

Run it yourself in ~90s against live testnet: `cd settler && npm run demo`.
A recorded run is in [`demo/sample-run.txt`](./demo/sample-run.txt).

## The problem

On any transparent exchange your order is public the moment it lands — bots jump
ahead (frontrunning) and bend the price against you (sandwiching). Billions are
extracted this way every year. **Stellar has no public mempool**, so it dodges
Ethereum's worst case — but front-running doesn't need one: transparent on-chain
order books and AMM reserves leak your size and direction, and validators decide
the order of transactions inside a ledger. A bot can only react to an order it can
**see**, and a sequencer can only reorder one it can **read** — so Stelvin makes
orders physically invisible until they all clear at one price.

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
fair *before* MEV scales, by **composing** rails that only exist here — a live,
on-chain BLS12-381-verifying drand relay (which we call, not reimplement) on top of
Stellar's native crypto. (Honest scope: our contract's own gate is a cheap sha256
against the relay's verified commitment — the BLS pairing lives in the relay.)

## Real-world use case — tokenized RWA / institutional dark pool

The honest read above ("Stellar-native MEV is marginal today") is exactly why the
*target user* matters. Stellar's DeFi growth is driven by **RWA (tokenized
treasuries, money-market funds) and institutions** — TVL up ~7× YoY, institutional
wallets +51% in 2025. These are large-volume actors who care most about **intent
privacy, fair execution, and compliance**. That reframes Stelvin from a retail toy
into infrastructure. Four use cases, led by the **provable victim today**, then the
growth wedge (honest ordering):

1. **Fair execution for active Stellar DeFi traders (provable today).** The
   measured, citable victim: traders losing bps to sandwiching / front-running
   (~1.2% of DEX trades, avg 0.41% loss). Sealed batches remove it by construction
   — fair-by-default *before* MEV scales on Soroban. This is the problem we can
   prove now, and it's exactly what the live demo shows.
2. **On-chain dark pool for RWA & institutional block trades (biggest upside).** A
   fund/treasury/anchor rotating a large position (e.g. $1M tokenized T-bill →
   USDC) leaks intent if it broadcasts. TradFi built **dark pools** for exactly this
   (~15% of US equity volume). Stelvin is the on-chain version — the growth wedge as
   Stellar's RWA/institutional flow scales (honest: that flow is small *today*).
3. **Fair stablecoin / FX conversion (USDC↔EURC corridors).** Stellar's core is
   cross-border payments/FX; front-running a large conversion is real loss. A
   sealed batch gives a fair mid-price venue — Stellar's home turf.
4. **Fair RWA primary issuance / token launch.** Sealed-batch price discovery
   defuses sniping/front-running at issuance and allocation.

**Sharpest positioning:** *fair execution for Stellar DeFi traders today — and the
on-chain dark pool for tokenized-RWA & institutional flows Stellar is winning next.*
(We lead with the provable problem; RWA is the upside, not an unevidenced claim.)

**Why this is real, not a relabel.** The contract is **asset-agnostic** (the base
asset is any token address), so the demo trades a tokenized US T-bill (`tUSTB`) vs
USDC near **par/NAV** with the core mechanism unchanged. And RWA tokens are
**permissioned** — so we added a **backward-compatible on-chain KYC allowlist**
(`set_permissioned` / `set_kyc`; default off = the open demo is unchanged). In the
RWA demo the gate is on, the desks (alice/bob) are allowlisted, and an un-KYC'd
address (`mallory`) is **rejected on-chain** — making the institutional framing
real, not cosmetic. *Honest boundary:* we do **not** claim auditor-only selective
disclosure — that doesn't fit a timelock. Privacy is *temporal* (hidden until R,
then fully public), so **post-trade transparency** is the compliance posture.

What's still needed to go from prototype to product (stated plainly): real
liquidity/counterparties, anchor/RWA-issuer integration, and the compliance layer
above hardened — concrete steps, on the roadmap.

## Market & Business Model

No invented valuation — the direct comp does the talking, and we're honest the
Stellar-native market is early.

| Layer | Figure | Read |
|---|---|---|
| **TAM — the problem** | **$1.3B–$3B+/yr** extracted by MEV | ~1.2% of DEX trades are sandwiched (avg 0.41% loss); DEX volume ~$3.5T/yr. A few bps of protected volume is large. |
| **Comp — what a winner earns** | CoW Protocol **~$93.5M mcap · ~$15.6M/yr** revenue | Same primitive (batch auction + solver). Evidence a sealed-batch venue can be a ~$100M-scale protocol. |
| **SAM — Stellar today (honest)** | **~$161M TVL** (May 2026), ~7× YoY | RWA/institutional-driven; institutional wallets +51% in 2025. Small but fast-growing — and the segment that cares most about intent privacy. |
| **SOM — near-term wedge** | RWA / institutional block trades | Become Stellar's fair-execution venue as Soroban DeFi scales. |

**Revenue model** (mirrors CoW): (1) **trading fee on matched volume — already live
on-chain** (`fee_bps`, a CoW-matched 2 bps in the demo; conservation-safe, taken
from the quote leg, admin-withdrawable — ADR-018); (2) surplus capture — share of
the price improvement vs a transparent venue (roadmap, reference-priced);
(3) institutional/B2B venue access (block-trade desk onboarding); (4) white-label —
license the sealed-batch engine to anchors & RWA platforms; (5) protocol token
(fee capture / governance).

**Honest bottom line:** Stelvin is early and the Stellar-native MEV market is
marginal *today*. The bet is proactive infrastructure for the segment Stellar is
actually winning (RWA/institutional) before MEV scales. The CoW comp (~$93.5M mcap
/ ~$15.6M/yr) is real evidence of the ceiling if it rides Stellar's RWA growth.

*Sources:* Flashbots / Gate (MEV stats) · CoinGecko / CoinMarketCap (CoW) ·
DefiLlama (Stellar TVL) · CoinLaw (DEX volume).

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
- **Threat model:** a transaction-ordering / sandwich adversary — transparent
  on-chain order books and AMM reserves, plus validator-decided intra-ledger
  ordering (Stellar has **no public mempool**, and we don't rely on it being one).
  Pre-`R` there is no plaintext to observe or reorder around; post-`R` everything
  clears atomically at one price.
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
Kaçar) as a timing/key oracle — we don't redeploy it. Full rationale (19 ADRs) in
[`DECISIONS.md`](./DECISIONS.md).

## Live & verifiable (every number is real — check it)

Deployed on Stellar **testnet**; judges can inspect on
[stellar.expert](https://stellar.expert/explorer/testnet) or run the scripts.

| Item | Value |
|---|---|
| BatchGate (permissioned RWA) | `CAFQP734PFBBUCQQCD2NXUB6CDTXCWAHYT4ZUWJM5FNKOUBZPSM7STQE` |
| Drand-Relay (oracle, called) | `CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM` |
| Test tUSTB / USDC SACs | `CAUDJW4XV2AFXCNUYVHU6IIM5D27745Z6NYFH5PGSTFDYAGQJO5BDZQU` / `CAE7ERCVPJ5MIC7TI3PRDBNMXD4WYIZV7A6Q5ZR33QVDRV2364JLGBBO` |
| Contract | 25/25 unit tests, wasm 31,531 bytes, `wasm32v1-none` |
| KYC gate (live) | permissioned mode on; un-KYC'd address rejected on-chain (`PermissionedSet`/`KycSet` events) |
| Live RWA settle | round `29217096`, `P*=1.00` (par), 10,000 tUSTB ↔ 9,998 USDC, **2 bps fee accrued + withdrawn**; re-decryptable by anyone via `npm run verify` |
| Sigma encoding | CLI-verified (round `29196000`): `sha256(48B compressed sig)==relay.get(R)` |

**Test it:**
```sh
cargo test -p batch-gate                 # 25/25 contract tests
bash scripts/deploy_and_smoke.sh         # one command: deploy + e2e on testnet
cd settler && npm install && npm run demo # the frontrunner-bot showdown (live)
```

## Status & roadmap

- ✅ **M1** contract (sealed orders, standing-balance escrow, on-chain uniform-price
  matching, conservation-safe + revert-proof settlement, drand timing/key gate).
- ✅ **RWA pivot** (ADR-017): asset-agnostic core → tUSTB/USDC near par; backward-
  compatible permissioned **KYC allowlist** (un-KYC'd address rejected on-chain).
  25/25 tests; positioned as an on-chain dark pool for RWA / institutional flows.
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
- **Composes Stellar rails (honest):** the timelock gate is enforced by the live,
  on-chain BLS12-381-verifying Drand-Relay we *call* (not reimplement) + Noether's
  SEP-40 oracle, atop native Soroban crypto. Our contract's own check is a cheap
  sha256 against the relay's verified commitment — composition, not a borrowed BLS
  implementation. The gate exists *because* of capabilities unique to this network.

## Tracks

**Main** (automatic) + **Privacy** (primary). Agentic is roadmap, not claimed here.
