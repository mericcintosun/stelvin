# Project context — Stelvin

MEV-resistant, sealed-bid **batch auction** on Stellar Soroban. Orders are
drand-timelock-encrypted and unreadable (operator/settler included) until a
committed drand round `R`; then the whole batch clears at one **on-chain uniform
price**. See [`DECISIONS.md`](./DECISIONS.md) for the full "why" (14 ADRs, privacy
disclosures, milestones) — it is the source of truth. This file is the
operational quick-reference every session reads automatically.

Tracks: Main (auto) + Privacy (primary). Agentic = post-hackathon.

## Repo layout
- `contracts/batch-gate/` — BatchGate+Escrow Soroban contract (Rust). **Our work.**
- `Drand-Relay/` — vendored reference oracle (Kaan Kaçar's, deployed). We only
  *call* it; never redeploy. Excluded from the cargo workspace.
- `stellar-ai-guide/` — cloned reference guide (gitignored, not ours).
- `DECISIONS.md` / `README.md` — docs.

## Toolchain (pinned, already installed)
- Rust `1.96`, target **`wasm32v1-none`** (NOT `wasm32-unknown-unknown`).
- `soroban-sdk = "25.3.1"`; stellar CLI `25.2`.
- Build wasm: `stellar contract build` (output: `target/wasm32v1-none/release/batch_gate.wasm`).
- Test: `cargo test -p batch-gate` (currently 12/12 green).

## Soroban contract conventions (already in code — match them)
- Storage keys via `DataKey` enum; config in instance storage, data in persistent
  with `extend_ttl(MIN_TTL=17_280, EXTEND_TO=518_400)`.
- Events use the modern `#[contractevent]` macro + `.publish(&env)` — NOT the
  deprecated `env.events().publish(...)`.
- Cross-contract calls use a local `#[contractclient]` trait (`DrandRelayClient`),
  not a crate dependency on the relay.
- Money: internal standing-balance ledger (`deposit_funds`/`withdraw` move SAC
  tokens; `settle` only mutates internal balances — no token transfers).
- Invariants to preserve: **conservation** (Σbuy_base == Σsell_base; quote pool
  ≥ 0 via ceil-collect/floor-pay), **revert-proof settle** (floor-then-trim +
  one-order-per-trader-per-batch), **on-chain uniform price** (settler never sets
  price). Don't regress these — they're the project's core claims.

## Key constants & addresses
- Drand-Relay verifier (testnet): `CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM`
- Feeder / raw-sigma API: `https://stellardrand.duckdns.org` (canonical drand quicknet API)
- drand chain: quicknet · `bls-unchained-g1-rfc9380` · 3s period · genesis `1_692_803_367`
- `PRICE_SCALE = 1e7`, `FEAS_SCALE = 1e9`, `FUTURE_ROUND_BUFFER = 12`, `MAX_ORDERS = 16`
- Relay stores `sha256(sig_compressed)`; tlock decrypt needs the **raw 48-byte
  compressed** sigma from the quicknet API. On-chain we assert
  `sha256(sigma_R) == relay.get(R)`.

## Off-chain settler / frontend (TS — upcoming M3/M4) — SDK gotchas
From the Stellar AI guide; bake these in to avoid the common traps:
- `@stellar/stellar-sdk` **v14**: the RPC namespace is **`rpc`**, not `SorobanRpc`.
  Use `new rpc.Server(url)` and `rpc.assembleTransaction()`.
- Testnet RPC: `https://soroban-testnet.stellar.org`; passphrase `Networks.TESTNET`.
- `sendTransaction()` returns **PENDING** — poll `rpc.getTransaction(hash)` until
  `SUCCESS`/`FAILED` (1s interval, ~30s timeout). Don't treat the send as final.
- Encryption: `tlock-js` (encrypt-to-round on quicknet).
- USDC testnet issuer (if using real USDC): `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.
  Note: for the demo we deploy our **own** test SACs (X + a quote token), so this
  is only relevant if integrating canonical testnet USDC.
- Frontend bindings: prefer `stellar contract bindings typescript` over hand-rolled clients.

## Honesty rules (the project's framing — keep it)
- Confidentiality is trustless & temporal (timelock). Decrypt-correctness AND
  order inclusion are **trusted-settler, v1-optimistic but publicly auditable**.
  Never claim "trustless on-chain reveal."
- MEV claim scope: **intra-batch** frontrunning/sandwiching is cryptographically
  eliminated. Cross-batch / auction game theory is out of scope.
- Metadata (participant addresses, order count, timing) is **public pre-`R`**.

## Workflow notes
- Don't commit/push unless asked. `Drand-Relay/` and `stellar-ai-guide/` are
  reference; only `contracts/`, root docs, and config are Stelvin's own.
- When in doubt about a Soroban API, check the installed SDK source under
  `~/.cargo/registry/src/.../soroban-sdk-25.3.1/` rather than guessing.
