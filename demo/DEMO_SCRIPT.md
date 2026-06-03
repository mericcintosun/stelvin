# Stelvin — 5-minute live demo script

> One spine, rehearsed. Everything else is a 10-second aside. The single win is:
> **the same bot sandwiches a visible order, and provably cannot touch a sealed one.**

## Before you walk in (setup)
- Backend running: `cd settler && npm run server` (`/api/health` returns the live GATE).
- Frontend running: `cd web && npm run dev` → open `#/demo`, hard-refresh.
- A clean **recorded run** is open in a second tab: [`demo/sample-run.txt`](./sample-run.txt) — the fallback.
- Optional: pre-fetch `cargo test -p batch-gate` output (23/23) in a terminal tab.

## The spine (≈3.5 min)
1. **The problem (30s).** "Every order is visible the moment you send it. Bots jump
   ahead and bend the price against you — ~1.2% of DEX trades get sandwiched."
2. **The showdown (2 min).** Hit **Run demo**. Narrate the two panels:
   - LEFT (transparent AMM): the bot front-runs → the desk fills worse → bot back-runs.
     "**+315 USDC to the bot, −268 to the desk.**"
   - RIGHT (Stelvin, live): "Same bot, same trade — but the order is timelock-sealed.
     It pulls the *real on-chain ciphertext* and runs tlock decrypt… and fails:
     *'too early to decrypt — decryptable at round R'* — every round."
3. **The reveal (45s).** "The drand beacon publishes round R. Now anyone can decrypt,
   and the batch settles on-chain at **one uniform price**. Both sides fill equally.
   **Frontrun attempts: N — zero successful.**"
4. **One-breath asides (15s).** "It's permissioned (KYC) for RWA desks, it charges a
   real 2 bps on-chain fee, and the clearing price is computed by the contract, not us."

## The privacy line (≈45s — the side-track win)
"What's hidden: order side, amount, price — from everyone, including us, until R.
What's *not*: addresses, order count, timing — we say so up front. Technique: drand
timelock (BLS12-381 IBE). And settlement is **publicly auditable** — `npm run verify`
re-decrypts every order from the public beacon signature, so a dishonest settler is
caught by anyone, no trust required."

## Close (≈15s)
"23 passing tests, live on testnet, one command to reproduce. MEV isn't promised
away — it's cryptographically impossible to react to."

---

## ⚠️ If the live settle stalls (feeder fallback)
drand's on-chain feeder occasionally **skips** the target round. Stelvin handles it:

- The demo **auto-retries** with a fresh batch and shows an **amber** line:
  *"beacon skipped round R — auto-retrying."* Say: **"That's the public beacon
  hiccuping, not the venue — it re-seals and continues."** Keep talking; it recovers.
- If it skips repeatedly (rare), **cut to the recorded run** ([`sample-run.txt`](./sample-run.txt)):
  "Here's a clean run from minutes ago — same flow, same result." Never block on it.
- Never blame your own backend; the error copy is written to say *stream interrupted*,
  not *backend down*.

## Numbers to have memorized
- Sandwich (LEFT): **bot +315.07 USDC**, desk **−268.07** to slippage.
- Settle (RIGHT): **P\* = $1.00 (at par)**, 2 bps fee, **0 successful frontruns**.
- **23/23** tests · wasm `wasm32v1-none` · live on testnet · `npm run verify` audits it.
