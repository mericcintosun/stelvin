// Single source of truth for site copy + on-chain facts.
// Every address/number here is real and traceable to SUBMISSION.md / DECISIONS.md
// / .stelvin/testnet.env, or to the cited public sources (MARKET). No drift.

export const LINKS = {
  github: "https://github.com/", // ← set to the public repo URL before launch
  explorer: "https://stellar.expert/explorer/testnet",
  demoBackendDefault: "http://localhost:8787",
}

export const ADDRESSES = {
  // Permissioned RWA BatchGate (tUSTB/USDC) — deployed on testnet.
  batchGate: "CCIX73WH4G6K3BGIUJ3TNOVCIRD6WFYXQFTINJIQCNVC2BYGYSXM2PLY",
  tustbSac: "CBBEJ6DG2UAH4ZTR7LEYPUVJ6WRXOLH7BNCKYYUVZM4TO2AW3IDZ3EZK",
  usdcSac: "CDPUH33N4ZR72YVIXPOHVKEP55T3SONR3T3JS4W5JNSXTOPR5FSZIEE6",
  drandRelay: "CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM",
  noetherOracle: "CBDH7R4PBFHMN4AER74O4RG7VHUWUMFI67UKDIY6ISNQP4H5KFKMSBS4",
}

export const NETWORK = {
  rpc: "https://soroban-testnet.stellar.org",
  passphrase: "Test SDF Network ; September 2015",
}

export const contractUrl = (id: string) => `${LINKS.explorer}/contract/${id}`
export const shortAddr = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`

// RWA framing: the demo trades a tokenized US T-bill (tUSTB) vs USDC near par.
export const RWA = { base: "tUSTB", quote: "USDC", navLabel: "$1.00 NAV" }

// Transparent-AMM sandwich figures — stable across SUBMISSION.md and the
// committed demo/sample-run.txt (the AMM math is identical).
export const SANDWICH = {
  botProfit: "+315.07",
  victimLoss: "268.07",
  asset: "tUSTB",
  quote: "USDC",
}

export const CRYPTO = {
  scheme: "bls-unchained-g1-rfc9380",
  beacon: "drand quicknet",
  period: "3s",
  tests: "21 / 21",
  wasmBytes: "29,208",
  target: "wasm32v1-none",
}

export const HERO = {
  tagline: ["Sealed orders.", "One fair price.", "Zero front-running."],
  sub: "A fair execution venue — an on-chain dark pool — for tokenized RWAs and institutional flows on Stellar. Orders are timelock-encrypted and unreadable by anyone (us included) until they clear at one uniform price. MEV isn't promised away; it's cryptographically impossible to react to.",
  cta: "Watch the live demo",
}

export const TWO_LAYERS = [
  {
    state: "sealed" as const,
    title: "Timelock encryption",
    body: "Desks encrypt {side, amount, limit price} to a future drand round R with tlock (BLS12-381 IBE). No one — not the operator, not the settler — can read a block order until the beacon publishes R. The key is held by no one.",
    tag: "hides order contents",
  },
  {
    state: "revealed" as const,
    title: "Uniform-price batch clearing",
    body: "At R the whole batch clears at a single price P* that the contract computes — not the settler. There is no 'first in line' edge, and the settler can't move the price.",
    tag: "removes ordering advantage",
  },
]

export const HOW_STEPS = [
  { n: "01", title: "Seal", body: "Encrypt your block order to a future drand round R and submit the opaque ciphertext on-chain. It's unreadable by everyone." },
  { n: "02", title: "Wait for round R", body: "The decryption key is a drand beacon signature held by no one — it only exists once the network publishes round R." },
  { n: "03", title: "Reveal & clear", body: "At R the batch is decrypted and settles on-chain at one uniform price. Same price for everyone, no ordering edge." },
]

export const WHY_STELLAR = [
  { title: "Where RWAs actually live", body: "Stellar's DeFi growth is driven by tokenized treasuries and institutions — the exact users who most need intent privacy and fair execution." },
  { title: "Native BLS12-381", body: "Soroban host functions make the timelock primitive practical on-chain — the gate exists because of capabilities unique to this network." },
  { title: "Live BLS-verifying relay", body: "The drand relay runs a full pairing check before storing each round, so even its operator can't commit a forged key." },
  { title: "~5s finality, native USDC", body: "Fast, cheap settlement and real-world rails — payroll, settlement, institutional flow — where fairness is a requirement." },
]

export const HIDDEN = ["Order side (buy / sell)", "Order amount", "Limit price"]
export const NOT_HIDDEN = ["Participant addresses", "Order count per batch", "Submission timing"]

export const TRUST = [
  { label: "Confidentiality", verdict: "Trustless & temporal", body: "Guaranteed by the timelock — secret until R, public after — not by any operator's promise." },
  { label: "Clearing price", verdict: "Trustless", body: "Computed on-chain by the contract, never by the settler." },
  { label: "Settlement integrity", verdict: "v1-optimistic, publicly auditable", body: "The settler is trusted to decrypt & include orders; because sigma_R is public after R, anyone can recompute the full decryption and detect a misreport. On-chain enforcement is roadmap." },
]

// Permissioned / RWA compliance posture (ADR-017).
export const COMPLIANCE = {
  title: "Compliance posture",
  body: "RWA tokens are permissioned — held only by vetted addresses. Stelvin runs an on-chain KYC allowlist (permissioned mode) so only approved desks can fund and submit. Privacy is temporal: hidden until R, then fully public — so post-trade everything is auditable. We do not claim auditor-only selective disclosure; that doesn't fit a timelock.",
}

// Real-world use cases, strongest → most speculative (honest ordering).
export const USE_CASES: { rank?: string; title: string; body: string }[] = [
  { rank: "Strongest", title: "On-chain dark pool for RWA & institutional flows", body: "A fund/treasury rotating a large tokenized position ($1M T-bill → USDC) leaks intent if it broadcasts. Traditional finance built dark pools (~15% of US equity volume) for exactly this. Stelvin is the on-chain version — fair, sealed, large-block." },
  { title: "Fair stablecoin / FX conversion", body: "Stellar's core is cross-border payments and FX. Front-running the rate on a large USDC↔EURC conversion is real loss. A sealed batch gives institutions a fair mid-price venue — Stellar's home turf." },
  { title: "Fair RWA primary issuance", body: "Sealed-batch price discovery for new asset launches / allocations, defusing sniping and front-running at issuance." },
  { title: "Proactive retail MEV protection", body: "Marginal on Stellar today, but DEX volume is ~$3.5T/yr and growing. As Soroban DeFi scales, fair-by-default matters before the damage arrives." },
]

// Market & business — every figure carries a source (see SUBMISSION.md).
export const MARKET = [
  { tier: "TAM — the problem", value: "$1.3B–$3B+/yr", body: "Value extracted by MEV. ~1.2% of DEX trades are sandwiched (avg 0.41% loss); DEX volume ~$3.5T/yr. Even a few bps of protected volume is large.", src: "Flashbots · Gate" },
  { tier: "Comp — what a winner earns", value: "~$93.5M mcap", body: "CoW Protocol — the same primitive (batch auction + solver) — ~$15.6M/yr protocol revenue. Proof a sealed/batch venue can be a ~$100M-scale protocol.", src: "CoinGecko · CMC" },
  { tier: "SAM — Stellar today (honest)", value: "~$161M TVL", body: "Stellar DeFi TVL (May 2026), ~7× YoY, RWA/institutional-driven; institutional wallets +51% in 2025. A small but fast-growing base — and the segment that cares most about intent privacy.", src: "DefiLlama" },
  { tier: "SOM — near-term wedge", value: "RWA dark pool", body: "Become Stellar's fair-execution venue as Soroban DeFi scales, entering through institutional / RWA block trades first.", src: "—" },
]

export const REVENUE = [
  "Trading fee on matched volume — primary, like CoW. Live on-chain (2 bps, conservation-safe, admin-withdrawable)",
  "Surplus capture — share of the price improvement vs a transparent venue (roadmap, reference-priced)",
  "Institutional / B2B venue access (block-trade desk onboarding)",
  "White-label — license the sealed-batch engine to anchors & RWA platforms",
  "Protocol token — fee capture / governance",
]

export const CREDIBILITY = [
  `${CRYPTO.tests} tests`,
  "Permissioned KYC gate",
  "Verifiable on stellar.expert",
  "Open source · MIT",
  "Main + Privacy tracks",
]
