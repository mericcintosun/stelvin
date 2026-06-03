# Stelvin — Architecture Decision Record

> MEV-resistant, sealed-bid batch auction on Stellar Soroban.
> Orders are drand-timelock-encrypted and unreadable — by anyone, including the
> operator/settler — until a committed drand round `R`. At `R` the whole batch
> clears at one uniform price computed on-chain. A frontrunner has nothing to
> react to, so MEV isn't promised away — it's cryptographically zero.

**Tracks:** Main (automatic) + Privacy (primary). Agentic is out of scope for v1.

This document records every architectural decision made for Stelvin, the
rationale and trade-offs behind each, what is in the MVP, and the milestone
plan. It is the canonical "why" companion to the code.

---

## 1. The problem

On a transparent exchange your order is public the moment you send it — resting on
an order book or visible in AMM reserves. Bots see it, jump ahead (frontrunning),
and bend the price against you (sandwiching). Billions of dollars per year are
extracted this way.

**Stellar has no public mempool**, so it dodges Ethereum's worst case — but
front-running doesn't *need* a mempool. Transparent on-chain order books and AMM
reserves expose your size and direction, and transaction ordering inside a ledger
is decided by validators. A bot can only react to an order it can **see**, and a
sequencer can only reorder one it can **read**. Stelvin makes orders physically
invisible until a future moment, so for the entire pre-reveal window there is
nothing to frontrun and nothing to reorder around. The guarantee is **temporal and cryptographic**: hidden
until round `R`, public after — by construction, not by trust.

**Scope of the claim (precise).** *Intra-batch* frontrunning and sandwiching are
cryptographically eliminated: within a batch no order is visible and a single
uniform clearing price removes any ordering advantage. The catchy "MEV is
cryptographically zero" framing refers to this. Cross-batch effects (a cleared
price informing the next batch) and the strategic game theory of uniform-price
auctions are normal, public-market phenomena — not victim-specific MEV — and are
explicitly outside the claim.

---

## 2. System architecture

```
Frontend (TS)            Off-chain settler (TS)            Soroban (Rust)
encrypt-to-round   ──►    tlock-js encrypt @ quicknet ──►   BatchGate + Escrow  (OUR contract)
deposit / submit                                            - store order ciphertext (opaque)
                                                            - standing-balance escrow
Drand-Relay (LIVE) ── get(R) / latest() ───────────────►    - timing gate + key auth
  = timing/key oracle                                       - on-chain uniform-price match
quicknet public API ── raw 48-byte sigma_R ──► settler:     - conservation-safe settlement
                                                settle()
```

Three parts we build, plus one external dependency we only call:

1. **Encryption layer (off-chain, tlock-js).** drand timelock encryption to a
   future round. The relay encrypts nothing — this is entirely ours/off-chain.
2. **BatchGate + Escrow contract (Rust/Soroban).** Our contract. Stores opaque
   ciphertexts, holds standing balances, gates reveal, and does on-chain
   matching + uniform-price clearing + settlement.
3. **Off-chain settler + frontend + demo frontrunner bot (TS).**
4. **External: Drand-Relay** (Kaan Kaçar's, already deployed on testnet). Used
   strictly as a timing/key oracle. We do **not** redeploy it. See `Drand-Relay/`
   (vendored reference; not our work — its README carries its own attribution).

---

## 3. Track strategy

- **Main:** automatic. Stelvin scores on technical depth, ecosystem fit
  (Soroban, cross-contract calls, native crypto host fns, testnet), and a
  famous "money is being stolen" narrative (MEV) reframed as *fair markets*.
- **Privacy (primary):** the track's mandatory disclosures (what's hidden / from
  whom / technique / threat model / crypto assumptions) fall out naturally — see
  §6. Stelvin uses a real primitive (drand tlock = BLS12-381 IBE) on top of a
  live, on-chain BLS-verifying oracle, which separates "real crypto" from
  "slideware" in a judge's eyes.

Honest self-assessment: Privacy is the stronger track (1st–2nd if the demo
works); Main is a 2nd–3rd realistic target. The single biggest determinant is a
working end-to-end demo, not idea quality — so MVP scope is deliberately tight
and the frontrunner-bot moment is treated as the highest-leverage deliverable.

---

## 4. Decisions (ADRs)

### ADR-001 — Sealed orders via drand timelock (tlock), not a custom scheme
**Decision.** Encrypt orders to a future drand round with `tlock-js`
(Boneh-Franklin IBE over BLS12-381, drand quicknet `bls-unchained-g1-rfc9380`).
**Why.** A live, audited, decentralized beacon gives a trustless *time lock*: no
party holds the key; it is published by the beacon at round `R`. No trusted
operator, no key-escrow, no commit-reveal griefing of the secret itself.
**Trade-off.** Decryption is off-chain; the guarantee is temporal (secret until
`R`, public after). We state this plainly rather than claiming on-chain reveal.

### ADR-002 — Drand-Relay is a timing/key oracle only; pull raw sigma off-chain
**Decision.** Use `relay.get(R)` / `relay.latest()` for timing and key
authenticity. The relay stores only `sha256(sig_R)`, **not** the raw BLS
signature. tlock decryption needs the raw 48-byte compressed `sigma_R`, which
the settler fetches from the public quicknet API.
**Why.** Verified from source: `drand-verifier::push()` runs a full on-chain
BLS pairing check (`e(σ,-g2)·e(H(m),pk)==1`) *before* storing `sha256(σ)`. So a
`Some` result from `get(R)` simultaneously proves (a) round `R` has arrived and
(b) the committed key is authentic — both trustless.
**Trade-off.** The settler must reach an off-chain API for the raw sigma; the
on-chain `sha256` check binds it to the verified commitment.
**Verified (CLI, round `29196000`).** `sha256(48-byte *compressed* signature
from api.drand.sh) == the round's published randomness == what the relay stores`.
Confirmed byte-for-byte before writing any settler code, so `settle()`'s encoding
assumption is proven. **Settler contract:** fetch the quicknet `signature` field
(48-byte compressed hex), hex-decode to `BytesN<48>`, pass that exact value to
`settle`. The **same** 48-byte compressed sig is also the tlock IBE decryption
key — one fetch serves both decrypt and settle. Pitfall: tlock-js sometimes uses
the 96-byte *uncompressed* sig; `settle` requires the **48-byte compressed** one.

### ADR-003 — Self-contained cross-contract client (no source dependency on relay)
**Decision.** Define our own `#[contractclient] trait DrandRelay { get; latest }`
instead of depending on the `drand-verifier` crate.
**Why.** Keeps Stelvin a clean standalone workspace, makes the boundary explicit
("the relay is an external oracle we call"), and reinforces our own-contribution
story. At deploy time we point at the *deployed* verifier address anyway.

### ADR-004 — Dual-asset X/USDC with a standing-balance model (not per-order escrow)
**Decision.** Traders pre-fund a standing balance (`deposit_funds`); orders carry
**no** per-order deposit; matched orders draw from the standing balance at
settle; `withdraw` returns unused balance.
**Why.** This is the single decision that resolves three problems at once:
- **No order-size leakage (ADR rationale for privacy):** a per-order deposit
  proportional to size would leak the order's size/side in cleartext before
  reveal. An aggregate standing balance reveals nothing about any single order.
- **Simpler escrow:** no two-sided per-order asset locking.
- **No refund race:** an unmatched order never debits anything, so there is
  nothing to refund (ADR-010, ADR rationale below).
**Trade-off / residual leak (disclosed):** if a user funds their balance to
*exactly* one order's value, size can be inferred — user's responsibility;
standard practice is to hold a balance larger than any single order.

### ADR-005 — No anti-spam bond; require a positive standing balance to submit
**Decision.** `submit_order` asserts the trader holds a positive balance in base
or quote. No separate bond/refund machinery.
**Why.** To place an order you must genuinely be funded, which makes spam
costly without extra code. Combined with `MAX_ORDERS = 16`, griefing is closed
in practice.

### ADR-006 — Internal-balance accounting at settle (no token transfers in settle)
**Decision.** `settle` only mutates the internal standing-balance ledger. Tokens
move via the SAC only on `deposit_funds` (in) and `withdraw` (out).
**Why.** Standard dYdX/0x-style design: atomic, cheap, and avoids `16 orders ×
2 transfers` of cross-contract SAC calls hitting Soroban resource limits.
**Trade-off.** A trader must call `withdraw` to see realized gains as on-chain
tokens — entirely normal.

### ADR-007 — `create_batch` is admin-only in v1
**Decision.** Only the admin opens batches.
**Why.** The admin merely chooses the reveal round. It **cannot** read orders,
set the price (matching is on-chain), or reveal early (timing gate is in the
relay). So admin-only costs no security claim; it just prevents spam batches and
keeps demo control. Making it permissionless/cron is a one-line change.

### ADR-008 — Uniform-price call auction (frequent batch auction)
**Decision.** All orders in a batch clear at one price `P*` that maximizes
matched volume. Orders are `{ side, amount, limit_price }`. Reference: Budish
"Frequent Batch Auctions."
**Why.** A single uniform price removes intra-batch ordering advantage, which is
exactly what kills frontrunning. Candidate prices are the set of submitted limit
prices (the clearing price always sits at some order's limit in a discrete book).
**Tie-break.** Maximize matched volume, then minimize `|demand − supply|`, then
prefer the lower price (deterministic, buyer-favoring).

### ADR-009 — Pro-rata fills on the long side
**Decision.** At `P*`, the short side fills 100%; the long (oversupplied) side is
pro-rated down to the matched volume by order size.
**Why.** Fairer than a marginal cut-off and not much harder. (If pro-rata ever
became a risk to the demo, the fallback is a marginal cut — kept in the back
pocket, not used.)

### ADR-010 — Conservation-safe matching: global feasibility scalar + floor-then-trim + ceil/floor quote
**Decision.** A three-part construction guarantees the internal ledger never
mints or burns value **and never reverts**:
1. **Global feasibility scalar `r ∈ [0,1]`.** `r = min_i(feasible_i / raw_fill_i)`
   over every eligible order (buy feasibility from quote balance, sell from base
   balance). Scaling **both** sides by the same `r` keeps the book balanced —
   this replaces the earlier (broken) one-sided cap that could make `Σbuy ≠
   Σsell` and let sellers lose unbacked base.
2. **Floor-then-trim base split.** Each order's fill is `⌊raw·r/FEAS⌋`. Because
   `raw·r/FEAS ≤ feasible_i` by construction, flooring keeps every fill **within
   the trader's balance** — so the apply step can never revert (buyer
   `⌈quote⌉ ≤ balance`, seller `base ≤ balance`). Independent flooring may leave
   the two sides summing to slightly different totals, so `traded = min(Σbuy,
   Σsell)` and the larger side is *trimmed* down to it (trimming only decreases
   fills, preserving the no-revert property). Result: `Σbuy == Σsell == traded`
   **exactly** — base conserves exactly.
3. **Safe quote direction.** Buyers pay `⌈base·P*/SCALE⌉`, sellers receive
   `⌊base·P*/SCALE⌋`. Since `Σbuy_base == Σsell_base`, `Σ⌈·⌉ ≥ Σ⌊·⌋`: the
   contract's quote pool can only retain dust, never go negative.
**Why.** Without (1) a balance shortfall on one side silently mints/burns base
("balances don't add up" — a demo-killer). An earlier draft used a
*cumulative-exact split* that summed both sides to a common `traded = ⌊M·r⌋`, but
that split could round a feasibility-tight order **up** by 1 unit which, combined
with the `⌈quote⌉` charge, could push a binding buyer past their balance and
**revert the entire settle**. Floor-then-trim only ever rounds *down*, so it is
both exactly conservative and revert-proof. Covered by tests
(`test_prorata_conservation`, `test_feasibility_scaling_conserves`,
`test_underfunded_multi_no_revert_and_conserved`).
**Why no-revert is total (not just "asserts prevent negatives").** Feasibility is
computed against a balance *snapshot*. If one trader held *multiple* eligible
orders, the snapshot could exceed what's affordable once earlier fills are
applied sequentially, and the apply-time asserts would then **revert the whole
settle** (a liveness risk, not a clean block). v1 closes this by **enforcing
one order per trader per batch** in `submit_order` (ADR-013), so snapshot ==
apply-time balance and the floor bound holds at apply time — settle is
revert-proof, not merely non-negative. **Limitation:** market-makers wanting
several orders per batch need per-trader feasibility aggregation — future work.

### ADR-015 — Reveal dedup + lifecycle events
**Decision.** (a) `settle` rejects a `revealed[]` array containing a duplicate
`order_id` (`seen` check, cheap at `MAX_ORDERS = 16`). (b) The contract emits
typed `#[contractevent]`s: `BatchOpened`, `OrderSubmitted`, `BatchSettled` (each
topic-indexed by `batch_id`).
**Why.** (a) narrows the trusted-settler surface (ADR-014) to *only*
`side/amount/price` — without it, a settler could inflate an order's weight by
repeating its id. (b) lets the frontend/settler/demo follow batch lifecycle
without polling and makes the "opened / settled at price X" moments legible,
which directly serves the highest-leverage deliverable (a working, visual demo).

### ADR-011 — Permissionless `settle`
**Decision.** Anyone may call `settle(batch_id, sigma_R, revealed[])` after `R`.
**Why.** The timing gate and `sha256` key check make a malicious caller unable to
open early or use a fake key. The clearing price is computed on-chain, so the
caller cannot manipulate it. The only trusted input is decrypt correctness
(ADR-014), and because the reveal is public, a dishonest settle is detectable
off-chain.

### ADR-012 — Collapse timing gate + key auth into one `relay.get(R)`
**Decision.** `settle` does `committed = relay.get(R).expect(...)` then asserts
`sha256(sigma_R) == committed`.
**Why.** `get(R)` returning `Some` is itself the timing gate (round arrived) and
yields the authenticated commitment in the same call — mirrors Drand-Relay's
dice-game pattern exactly. Fewer cross-contract calls, less surface area.

### ADR-013 — `MAX_ORDERS = 16`, `FUTURE_ROUND_BUFFER = 12`, one order per trader
**Decision.** Cap a batch at 16 orders; require the reveal round to be ≥ 12
rounds (~36s at 3s/round) ahead of the estimated current round; allow **at most
one order per trader per batch** (`DataKey::Submitted(batch_id, trader)` guard in
`submit_order`). The per-trader cap is what makes settle revert-proof (ADR-010).
**Why.** 16 keeps `settle` inside Soroban resource limits with a single-call
settlement. ~36s gives the feeder time to publish `R` and is practical to show
live in a demo. If the cap is ever hit, `settle` can be paginated
(reveal/store → match/distribute) — future work.

### ADR-014 — Honest trust framing (mock decrypt = trusted settler in v1)
**Decision.** In v1, the contract trusts that the settler's `revealed[]` are the
correct decryptions of the stored ciphertexts (the `side/amount/price` fields).
The **trader identity** is always taken from storage, never the settler.

**Full trusted-settler surface (honest).** Beyond field values, the settler also
controls **which** stored orders appear in `revealed[]` and could **omit
(censor)** an order. We narrow this where cheap: duplicate `order_id`s are
rejected on-chain (ADR-015 dedup) and one-order-per-trader-per-batch is enforced
(ADR-013/`submit_order`), so weight cannot be inflated by repetition. Omission
cannot be prevented in v1 without an on-chain inclusion proof — it is *mitigated
by public auditability*: because `sigma_R` is public after `R`, anyone can
recompute the full decryption of all stored ciphertexts and detect a censored or
misreported order. So the optimistic surface is `{side, amount, price}` per
order **plus inclusion/completeness**, all publicly checkable.
**Why.** On-chain IBE verification is out of scope for 36h. We refuse to claim
"trustless on-chain reveal." README/slide framing: *timelock = trustless
confidentiality; decryption is public and verifiable; settlement integrity is v1-
optimistic, with on-chain BLS / fraud-proof as roadmap.* Stretch ADR-002's
independent on-chain pairing of `sigma_R` is redundant (the relay already BLS-
verified) and is therefore left last.

---

### ADR-016 — Noether SEP-40 oracle as a non-blocking fair-value reference
**Decision.** After settlement, the settler/demo reads Noether's deployed on-chain
oracle (SCF #41 perp DEX) as a fair-value sanity check next to Stelvin's clearing
price — **display-only, strictly non-blocking**, never touching the contract or
`settle`.
**Discovery (live, ADIM 0 — not guessed).** Oracle Adapter
`CBDH7R4PBFHMN4AER74O4RG7VHUWUMFI67UKDIY6ISNQP4H5KFKMSBS4`:
`get_price(asset: Symbol) -> OraclePriceData { price: i128, source: Symbol,
timestamp: u64, confidence: u32 }`, `decimals() == 7`. Confirmed live: `get_price("XLM")`
→ `$0.2214`, source `aggregated`. The 7-decimal scale matches our `PRICE_SCALE`
exactly, so values are directly comparable. Read via `--send=no` (read-only
simulation, **no tx, no API key, permissionless**).
**Why.** Real ecosystem composition on the same testnet, and it strengthens the
"fair markets" narrative with an independent reference. **Why non-blocking:**
`readOracleFairValue()` is wrapped in try/catch with a timeout and returns `null`
on any failure — a paused/stale/unreachable oracle must never break the demo or
settle (the CLI fallback `demo/sample-run.txt` also stands). The demo's market is
relabeled XLM/USDC with fixed prices near the oracle level (~$0.22) so the check
is meaningful — the prices are **not** oracle-derived, preserving non-blocking.
**Honesty.** The oracle is a *reference*, not the price source; Stelvin's price
still comes from sealed orders. On-chain soft-guardrail (reject settles far from
the oracle) is roadmap, not v1.

### ADR-017 — RWA pivot: asset-agnostic core + backward-compatible KYC allowlist
**Decision.** Position Stelvin as a **fair execution venue / on-chain dark pool for
tokenized RWAs and institutional flows** on Stellar — the segment actually driving
Stellar's DeFi growth (RWA/treasuries + institutions; TVL ~7× YoY, institutional
wallets +51% in 2025), which is also the segment that most needs intent privacy and
fair execution. The core mechanism is unchanged: the contract is **asset-agnostic**
(`asset_base` is any token address), so the demo simply points `asset_base` at a
tokenized US T-bill (`tUSTB`) traded vs USDC near **par/NAV**.
**One contract addition (and only one):** a **backward-compatible permissioned KYC
allowlist**, because RWA tokens are permissioned (held only by vetted addresses).
- Storage: `Permissioned` (bool, default unset = false) + `Allowed(Address)`.
- `set_permissioned(enabled)` and `set_kyc(trader, allowed)` — admin-only
  (the RWA issuer / compliance role); emit `PermissionedSet` / `KycSet`.
- `deposit_funds` / `submit_order` call `require_kyc`, which is a **no-op while
  permissioned is off**. So the existing 12 tests and the open demo path behave
  *identically*; 5 new tests cover the gate (allowlisted passes, un-KYC'd deposit
  and submit are rejected, revocation re-blocks, default-off is open). 17/17 at this
  stage (21/21 after ADR-018's fee tests).
**Why not auditor selective disclosure.** Tempting for "compliance," but it does
**not** fit Stelvin's timelock: privacy here is *temporal* (hidden from everyone
until R, then public to everyone) — there is no "hide from the public, show an
auditor" window. Claiming it would be over-reach and break our honesty stance.
Instead the compliance posture is **post-trade full transparency** (anyone can
recompute the decryption from the public `sigma_R`) plus the on-chain KYC gate —
both real and auditable.
**Trade-off / honest status.** This makes the RWA framing *real* (an un-KYC'd
address is rejected on-chain in the demo), not cosmetic — but going from prototype
to product still needs real liquidity/counterparties, anchor/RWA-issuer
integration, and a hardened compliance layer. Those are roadmap, stated plainly.
**Market read (sourced, in SUBMISSION.md).** Direct comp CoW Protocol (same
primitive) ~$93.5M mcap / ~$15.6M/yr revenue evidences a ~$100M-scale ceiling;
Stellar-native SAM is small today (~$161M TVL) but fast-growing in exactly this
segment. No invented valuation.

### ADR-018 — Protocol fee (conservation-safe), surplus capture as roadmap
**Decision.** Add an admin-configurable **protocol fee in basis points** (`set_fee_bps`,
default 0, capped at `MAX_FEE_BPS = 1000`). The fee is taken **only from the quote
leg** at settle and credited to an internal, admin-withdrawable ledger
(`Fees(asset)` + `withdraw_fees`). It turns the business model from a claim into a
working on-chain mechanism without touching the matching/clearing logic.
**Conservation (the critical constraint).** A fee is value *redistribution*, not
creation — the "nothing minted/burned" invariant (ADR-010) must hold. Construction:
buyers still pay `⌈base·P*/SCALE⌉`; sellers receive `⌊base·P*/SCALE⌋ · (1 −
fee_bps/10000)` (floored, so rounding favors the protocol, never pushes a seller or
the pool negative); the **protocol fee is the residual** `Σbuy_quote −
Σseller_quote`. Because `Σ⌈·⌉ ≥ Σ⌊·⌋ ≥ Σnet`, the residual is always ≥ 0, and by
definition `Σbuy_quote == Σseller_quote + protocol_fee` — quote conserves exactly,
base is untouched. With `fee_bps == 0` the residual is just the prior rounding dust,
so the original 12 + ADR-017's tests and the open demo behave identically. Covered by
`test_fee_conserves_accrues_and_withdraws`, `test_set_fee_bps_cap`,
`test_withdraw_fees_over_balance`, `test_fee_default_zero` (21 at that stage; 25/25 after ADR-019).
**Demo value.** The demo runs a block-size trade (10,000 tUSTB) at a CoW-matched
**2 bps** fee, so the accrued fee is real and visible on-chain; admin
`withdraw_fees` realizes it as revenue.
**Why surplus capture is roadmap, not v1.** CoW's main revenue is *surplus capture*
(≈50% of price improvement vs a reference, capped ~0.98%). That needs a trusted
reference price per trade — extra oracle surface and trust. v1 ships the simple,
fully-conservation-safe `fee_bps`; surplus capture is display-only in the demo and
on the roadmap. We don't claim it as implemented.

### ADR-019 — Hardening from the adversarial persona review (caps, feeder-retry, public auditor, honest ecosystem-fit)
**Decision.** Close the concrete gaps surfaced by a six-persona objective review,
without touching the matching engine or risking the working floor:
1. **Order-field overflow caps.** Soroban release builds don't trap on i128 overflow,
   so settler-supplied `amount`/`limit_price` are bounded (`MAX_AMOUNT = 1e16`,
   `MAX_PRICE = 1e15`) in the reveal validation — the hottest product `amount·m`
   (m ≤ MAX_ORDERS·MAX_AMOUNT) stays ≈1.6e33, >5 orders of magnitude inside i128.
   Covered by `test_order_field_cap_rejected`.
2. **Randomized conservation property test.** `test_conservation_randomized` runs 80
   deterministic-LCG scenarios asserting base conserves exactly, quote conserves
   exactly (buyer paid == seller received + protocol residual), residual ≥ 0, and
   no revert — turning the conservation claim from hand-picked into property-style.
   (No new crate; LCG keeps it `no_std`-friendly.)
3. **Feeder-resilient demo (off-chain).** drand's on-chain feeder occasionally
   *skips* the target round R (latest advances past R while `get(R)` stays null).
   The settler/SSE demo now detects the skip and **auto-retries** with a fresh batch,
   surfacing an amber "beacon skipped — retrying" (never blaming the venue); the
   recorded `demo/sample-run.txt` remains the last-resort fallback. This is the
   single highest live-demo risk, mitigated entirely off-chain.
4. **Public-auditability artifact.** `settler/src/verify.ts` (`npm run verify`)
   re-decrypts every on-chain order for a settled batch from the *public* `sigma_R`
   — no settler trust, no admin keys — making "v1-optimistic but publicly auditable"
   (ADR-014) a live, runnable artifact rather than a promise.
**Honesty correction (ecosystem-fit).** Docs/site no longer imply we *implement*
native BLS12-381. The BLS pairing lives in the deployed Drand-Relay we **call**;
our contract's gate is a cheap `sha256` against the relay's verified commitment.
We frame this as composition, not a borrowed crypto claim.
**Positioning correction.** Lead with the *provable* victim (active Stellar DeFi
trader losing bps to sandwiching) and frame RWA/institutional as the growth wedge —
aligning the pitch with the evidence base (the measured problem is retail-AMM MEV).
**Why no-revert is unaffected.** Caps only *reject* oversized inputs before any
multiplication; they don't change the floor-then-trim math (ADR-010), so the
revert-proof + conservation guarantees hold. 25/25 tests green.

## 5. Contract reference (BatchGate + Escrow)

**Storage (`DataKey`)**
- `Admin`, `AssetBase` (X), `AssetQuote` (USDC), `Relay` — config (instance)
- `NextBatchId`, `NextOrderId` — counters (instance)
- `Batch(u32)` → `{ id, reveal_round, status: Open|Locked|Settled, order_ids[] }`
- `Order(u64)` → `{ id, trader, batch_id, ciphertext }` (opaque blob)
- `Clearing(u32)` → `{ batch_id, price, matched_volume, settled_at }`
- `Balance(Address, Address)` → `i128` — standing balance per (trader, asset)
- `Submitted(u32, Address)` → `bool` — one-order-per-trader-per-batch guard
- `Permissioned` → `bool` (default false) — RWA/KYC gate toggle (ADR-017)
- `Allowed(Address)` → `bool` — KYC allowlist for permissioned mode (ADR-017)
- `FeeBps` → `u32` (default 0) — protocol fee in basis points (ADR-018)
- `Fees(Address)` → `i128` — accrued, admin-withdrawable protocol fees per asset (ADR-018)

**Functions**
| fn | auth | purpose |
|---|---|---|
| `__constructor(admin, asset_base, asset_quote, relay)` | deploy | one-time config |
| `deposit_funds(trader, asset, amount)` | trader | fund standing balance (SAC pull); KYC-gated when permissioned |
| `withdraw(trader, asset, amount)` | trader | withdraw free balance (SAC push) |
| `set_permissioned(enabled)` | admin | toggle RWA/KYC mode (default off) — ADR-017 |
| `set_kyc(trader, allowed)` | admin | KYC allowlist add/remove (issuer/compliance role) — ADR-017 |
| `set_fee_bps(bps)` | admin | set protocol fee in bps (default 0, cap 1000) — ADR-018 |
| `withdraw_fees(to, asset, amount)` | admin | withdraw accrued protocol fees — ADR-018 |
| `create_batch(reveal_round) -> u32` | admin | open a batch for round R |
| `submit_order(trader, batch_id, ciphertext) -> u64` | trader | sealed order; requires funded balance; one per trader per batch; KYC-gated when permissioned |
| `lock_batch(batch_id)` | permissionless | freeze once R available |
| `settle(batch_id, sigma_r, revealed[])` | permissionless | (a)+(b) gate, (e) match, (f) settle |
| `get_batch / get_order / get_clearing / get_clearing_price / get_balance / get_permissioned / is_kyc / get_fee_bps / get_fees` | view | reads |

**`settle` steps (mapping to the design)**
- **(a)+(b)** `committed = relay.get(R)`; `assert sha256(sigma_r) == committed`
- **(c)** [stretch, skipped] independent on-chain BLS pairing — redundant
- **(d)** [mock] trust `revealed` ↔ ciphertext; trader read from storage; reject
  duplicate `order_id`s (ADR-015)
- **(e)** `match_and_settle`: candidate-price scan → `P*` → eligibility → global
  `r` → floor-then-trim fills → ceil/floor quote (ADR-010)
- **(f)** write `Clearing`, set `Settled`, emit `BatchSettled`

**Events** (ADR-015): `BatchOpened(batch_id, reveal_round)`,
`OrderSubmitted(batch_id, order_id, trader)`,
`BatchSettled(batch_id, price, matched_volume)` — all topic-indexed by `batch_id`.
Plus (ADR-017): `PermissionedSet(enabled)`, `KycSet(trader, allowed)`.
Plus (ADR-018): `FeeBpsSet(bps)`, `FeesAccrued(batch_id, asset, amount)`.

---

## 6. Privacy track — mandatory disclosures

- **What is hidden:** order *contents only* — side (buy/sell), amount, limit
  price — encrypted in the ciphertext blob.
- **What is NOT hidden (metadata, public pre-`R`):** the participant set (each
  `Order.trader` address is on-chain in cleartext), the number of orders in a
  batch, and submission timing. Stelvin hides *what* you're trading, not *that*
  you placed an order. Hiding the participant graph (e.g. via stealth addresses
  or a relayer/shielded pool) is out of scope for v1.
- **From whom:** all participants *and* the operator/settler — until round `R`.
- **Technique:** drand timelock encryption (`tlock` = Boneh-Franklin IBE over
  BLS12-381; `tlock-js`).
- **Threat model:** a transaction-ordering / sandwich adversary — transparent
  on-chain order books and AMM reserves, plus validator-decided intra-ledger
  ordering (Stellar has **no public mempool**, and we don't rely on it being one).
  Pre-`R` there is no order plaintext to observe or reorder around;
  post-`R` everything clears atomically at one uniform price. The precise
  guarantee is that **intra-batch frontrunning and sandwiching are
  cryptographically eliminated** (no order to see, no ordering advantage) — see
  §1 for scope vs cross-batch effects.
- **Cryptographic assumptions:** drand quicknet beacon liveness (the round
  signature is published at `R`) + BLS signature unforgeability. For the on-chain
  key check we additionally **inherit the deployed Drand-Relay's trust
  assumptions**: `push` is permissionless and runs a full BLS pairing check
  before storing, with no privileged round injection — so even the relay operator
  cannot commit a forged round (a fake signature fails `pairing_check`).
- **Residual leak (honest):** standing-balance funding amount is in cleartext; a
  user who funds to exactly one order's value can leak that size (ADR-004). Plus
  the metadata above.
- **Trust caveat (honest):** settlement integrity is v1-optimistic (ADR-014) —
  confidentiality is trustless, decrypt-correctness *and order inclusion* are
  trusted-but-publicly-auditable, on-chain enforcement is roadmap.

---

## 7. MVP scope

**In:**
- BatchGate + Escrow Soroban contract — **done**, 25/25 unit tests, wasm builds
  (31,531 bytes), `wasm32v1-none`. Includes the backward-compatible RWA/KYC gate
  (ADR-017) and the conservation-safe protocol fee (ADR-018).
- Dual-asset (RWA `tUSTB`/USDC in the demo), standing balances, sealed orders, on-chain uniform-price
  matching, conservation-safe + revert-proof settlement, drand timing+key gate,
  reveal dedup, lifecycle events.
- Off-chain settler (fetch raw sigma → tlock decrypt batch → call `settle`).
- Frontend (deposit/withdraw, encrypt-to-round submit, batch/clearing views).
- Demo frontrunner bot proving orders are unreadable pre-`R`.
- Testnet deployment against the live Drand-Relay verifier.
- README + technical docs + privacy disclosures.

**Out (explicitly, for v1):**
- On-chain IBE / fraud proofs for decrypt correctness (ADR-014).
- Independent on-chain BLS pairing of `sigma_R` in our contract (ADR-002,
  redundant).
- Multi-order-per-trader-per-batch feasibility (ADR-010 limitation).
- Paginated settle beyond 16 orders (ADR-013).
- Agentic track integration (agents as first-class traders) — post-hackathon.
- Passkey smart-wallet auth — nice-to-have, not in v1.

---

## 8. Milestones

- **M0 — Foundations (done).** Toolchain (Rust 1.96, `wasm32v1-none`, stellar
  CLI 25.2), standalone workspace, Drand-Relay studied & confirmed (on-chain BLS
  verify in `push()`), cross-contract client validated.
- **M1 — Contract (done).** `__constructor` + storage, `deposit_funds`/`withdraw`,
  `create_batch`/`submit_order` (balance guard), `lock_batch`, `settle` +
  `match_and_settle` (global feasibility scalar, floor-then-trim), reveal dedup,
  lifecycle events, one-order-per-trader guard, RWA/KYC allowlist gate (ADR-017).
  25 tests incl. conservation + no-revert + dedup + per-trader + KYC + fee + overflow caps + randomized property test + griefing guard + on-chain BLS verify; wasm release build green.
- **M2 — Deploy & wire (done).** Two test SACs (X, USDC) + BatchGate deployed to
  testnet against the live relay; full end-to-end CLI smoke-test **passed and is
  reproducible** via `scripts/deploy_and_smoke.sh` (one command:
  deposit → create_batch(R) → submit_order ×2 → feeder publishes R → fetch raw
  48-byte compressed sigma → on-chain `sha256(sigma)==relay.get(R)` ✓ → settle →
  balances change at the uniform clearing price). Confirmed: 100 X traded for 80
  USDC at `P*=0.8` (tie-break picked the lower crossing limit), conservation
  exact, `BatchSettled` event emitted. Latest BatchGate:
  `CAFQP734PFBBUCQQCD2NXUB6CDTXCWAHYT4ZUWJM5FNKOUBZPSM7STQE`. Next: typed
  frontend bindings.
- **M3 — Settler (done).** `settler/` (TypeScript, `tlock-js`). Step 0 proved the
  isolated quicknet round-trip in isolation (encrypt→R, **undecryptable before R**,
  decrypt==plaintext after) — retiring the tlock encoding risk before integration.
  Then real-tlock end-to-end on testnet: `create_batch` → tlock-encrypt orders →
  submit opaque ciphertext → **prove the on-chain ciphertext is unreadable pre-`R`**
  (`"too early to decrypt … decryptable at round R"`) → wait `R` → decrypt the
  batch from chain → `sha256(sigma)==relay.get(R)` ✓ → `settle`. Confirmed: orders
  decrypt to exactly their plaintext, clear at `P*=0.8`, balances move (+100 X /
  −80 USDC etc). tlock-js 0.9 default chain **is** quicknet (`mainnetClient()`
  correct). The pre-`R`-unreadable proof is the seed of the M5 bot demo. Scope: core
  round-trip only — daemon/retry/idempotency deferred.
- **M4 — Frontend.** *Phase A (done):* a browser version of the demo —
  `web/` (Vite/React) renders two live panels (transparent-AMM sandwich vs Stelvin
  sealed batch) by consuming Server-Sent Events from a thin backend
  (`settler/src/server.ts`) that reuses the settler `lib.ts` and runs the real
  on-chain flow (scripted actors, no wallet; tlock decrypt server-side). Verified:
  backend streams the full live event sequence, frontend builds + serves. This is
  the visual surface for the video. *Phase B (if time):* wallet-connect deposit /
  sealed-order submit (+ optional passkey smart wallet) for the UX-axis score.
- **M5 — Frontrunner bot demo (done).** `settler/src/frontrunner-bot.ts`
  (`npm run demo`) — two panels. LEFT: a *labeled simulation* of a transparent
  AMM sandwich with real constant-product mechanics (bot +315 USDC, victim −268 X).
  RIGHT: live on testnet — the same bot pulls the actual on-chain ciphertext and
  really runs `tlock` decrypt, failing *"too early … decryptable at round R"* on
  every attempt (with a live countdown) until the beacon publishes R, then the
  batch settles at one uniform price. Honesty framing is on-screen (two layers:
  timelock + uniform-price batch). A recorded run is kept in `demo/sample-run.txt`
  as a backup clip (feeder downtime must not kill a live pitch). The "unreadable
  before R, settled fairly after" contrast is the core demo moment. *Note: the
  live timing surfaced a real race — drand's public API publishes R slightly
  before the feeder pushes it on-chain, so the demo gates on the on-chain relay
  (what settle needs), not on decrypt-success.*
- **M6 — Docs & submission.** README, technical design doc, privacy disclosures
  (§6), demo video, submission form with Main + Privacy ticked.

---

## 9. Known limitations / future work

- Decrypt correctness is trusted in v1 (ADR-014) → on-chain BLS / fraud proofs.
- One order per trader per batch is *enforced* (makes settle revert-proof);
  multi-order-per-trader needs per-trader feasibility aggregation (ADR-010/013).
- Order metadata is public pre-`R`: participant addresses, order count, timing
  (§6). Hiding the participant graph is future work.
- Order inclusion/completeness is part of the trusted-settler surface (omission
  is possible but publicly auditable) — ADR-014.
- 16-order cap; paginate settle for larger batches (ADR-013).
- Current-round estimate uses ledger timestamp (same as dice-game); the relay's
  `latest()` could tighten this.
- Quote dust is retained by the contract pool (safe, negligible at 1e-7 scale).

---

## 10. Constants & deployed references

| key | value |
|---|---|
| Drand-Relay verifier (testnet) | `CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM` |
| Feeder API | `https://stellardrand.duckdns.org` |
| drand chain | quicknet · `bls-unchained-g1-rfc9380` · 3s period |
| drand chain hash | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| sigma encoding | **CLI-verified** (round `29196000`): `sha256(48-byte compressed sig) == randomness == relay.get(R)` |
| quicknet genesis (unix) | `1_692_803_367` |
| `PRICE_SCALE` | `10_000_000` (1e7) |
| `FEAS_SCALE` | `1_000_000_000` (1e9) |
| `FUTURE_ROUND_BUFFER` | `12` rounds (~36s) |
| `MAX_ORDERS` | `16` |
| Encryption | `npm install tlock-js` (quicknet) |
| Reference pattern | `kaankacar/Drand-Relay` → `contracts/dice-game` (commit-reveal) |
