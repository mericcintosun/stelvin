# Stelvin — 3-minute demo video script

**Rule:** ~60% of the runtime is the live demo. Architecture is minimal; the
contrast moment carries the pitch. Record the **CLI** demo (`npm run demo`) — do
NOT depend on a frontend. If the feeder lags on the day, fall back to the
recorded run in [`sample-run.txt`](./sample-run.txt). Show stellar.expert once for
credibility.

Total: 3:00. Demo block ≈ 1:50.

---

### 0:00–0:20 — Hook (the problem, the promise)
> "Every time you trade on a transparent exchange, bots see your order and front-run
> it — that's MEV, billions stolen a year. Stelvin is a DEX on Stellar where your
> order is **encrypted and unreadable by anyone** — even us — until it clears. Watch
> the same frontrunner bot try to attack two markets."

*(On screen: title card — "Stelvin · sealed-bid batch DEX · MEV cryptographically impossible to react to".)*

### 0:20–0:35 — What it is, in one breath
> "Orders are timelock-encrypted to a future drand round. When that round arrives,
> the whole batch reveals and clears at **one uniform price computed on-chain**.
> Two layers: timelock hides the order; batch clearing removes any ordering edge."

---

### 0:35–1:15 — DEMO, LEFT panel: transparent DEX (the attack works)
*(Run `npm run demo`; narrate the LEFT panel as it prints.)*
> "Left: a normal transparent AMM. Alice sends a visible buy order. The bot sees
> it on-chain — no mempool needed, the order book and reserves are public — and
> sandwiches her: buys ahead, lets her fill at the worse price, sells back.
> **The bot pockets 315 USDC; Alice loses 268 X to slippage.** This is real MEV
> mechanics. This is the status quo."

### 1:15–2:25 — DEMO, RIGHT panel: Stelvin (the attack is blind) — the money moment
> "Right: the **same bot**, now against Stelvin — **live on Stellar testnet**.
> Alice and Bob submit timelock-sealed orders. The bot pulls the *actual on-chain
> ciphertext* and really runs tlock decrypt…"

*(Let the countdown play — 5 attempts, each: "It's too early to decrypt … decryptable at round R", clock ticking down.)*
> "…and it fails. Every time. 'Too early to decrypt.' This isn't a scripted
> 'access denied' — the bot is genuinely running the decryption and the key
> doesn't exist yet. It's held by no one — only the drand beacon will publish it."

*(Round R lands; settle fires.)*
> "Round R arrives. The batch settles on-chain at **one uniform price, 0.8** —
> both sides fill equally, **zero successful frontruns**. The bot watched the
> whole time and never had anything to react to."

*(Optional 3s: cut to stellar.expert showing the settle tx / BatchGate contract.)*
> "Everything you just saw is on testnet — the contract, the settle, the balances.
> You can run this exact command yourself."

---

### 2:25–2:45 — Why Stellar, honestly
> "Why Stellar? This only works because Soroban has native BLS12-381 and a live,
> on-chain BLS-verifying drand relay — so the timelock is committee-free and cheap.
> And we're honest: MEV on Stellar is small *today*. That's the point — Stellar is
> built for real-world finance, so we make it fair-by-default **before** MEV scales,
> the way Ethereum wishes it had."

### 2:45–3:00 — Privacy disclosures + close
*(Slide: the five mandatory disclosures.)*
> "For the privacy track: we hide order **contents** — side, amount, price — from
> everyone until reveal, using drand timelock IBE. We're upfront about the limits:
> addresses and timing stay public, and settlement is optimistic-but-publicly-
> auditable today, with on-chain enforcement on the roadmap. Confidentiality is
> trustless. **Stelvin — fair markets, by construction.**"

*(End card: Main + Privacy tracks · github.com/mericcintosun/stelvin)*

---

## Production checklist
- [ ] Pre-run `npm run demo` once right before recording (warms it; confirms feeder is live).
- [ ] Terminal font large; clear the screen first; dark theme reads best on projector.
- [ ] Have `sample-run.txt` open in a second tab as the backup clip.
- [ ] One quick stellar.expert shot of the BatchGate contract for credibility.
- [ ] Keep architecture to the two-layer sentence — resist explaining the matching engine on camera.
