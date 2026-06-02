// Single source of truth for site copy + on-chain facts.
// Every address/number here is real and traceable to SUBMISSION.md / DECISIONS.md
// / .stelvin/testnet.env. Keep this in sync with those — no marketing drift.

export const LINKS = {
  github: "https://github.com/", // ← set to the public repo URL before launch
  explorer: "https://stellar.expert/explorer/testnet",
  demoBackendDefault: "http://localhost:8787",
}

export const ADDRESSES = {
  batchGate: "CBANDFRY6BXQRGRUXIJB6VUZHVH6E4JZIVWBY6JURFRHPWJQ7WT5UOFA",
  drandRelay: "CAESC7SC5EW5P2P3IM5Q7E64ZNDATVSN5F57NTCH5E7GJRPDM76KF7QM",
  noetherOracle: "CBDH7R4PBFHMN4AER74O4RG7VHUWUMFI67UKDIY6ISNQP4H5KFKMSBS4",
  xSac: "CCYIRVXHZUV2XWHZM4G7IGN65PYDQ76GBJTTUAQYENEAIBI6WEMG5BG5",
  usdcSac: "CAS6SHC4M3SVTAIPGF2WKM6TDMK76AOTUI65ADXBPRDMI2JFWMQCL2L7",
}

export const contractUrl = (id: string) => `${LINKS.explorer}/contract/${id}`
export const shortAddr = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`

// The transparent-AMM sandwich figures are stable across SUBMISSION.md and the
// committed demo/sample-run.txt (the AMM math is identical in both).
export const SANDWICH = {
  botProfit: "+315.07",
  victimLoss: "268.07",
  asset: "X",
  quote: "USDC",
}

export const CRYPTO = {
  scheme: "bls-unchained-g1-rfc9380",
  beacon: "drand quicknet",
  period: "3s",
  tests: "12 / 12",
  wasmBytes: "23,723",
  target: "wasm32v1-none",
}

export const HERO = {
  tagline: ["Sealed orders.", "One fair price.", "Zero front-running."],
  sub: "A sealed-bid batch DEX on Stellar. Orders are timelock-encrypted and unreadable by anyone — us included — until they clear at one uniform price. MEV isn't promised away; it's cryptographically impossible to react to.",
  cta: "Watch the live demo",
}

export const TWO_LAYERS = [
  {
    state: "sealed" as const,
    title: "Timelock encryption",
    body: "Traders encrypt {side, amount, limit price} to a future drand round R with tlock (BLS12-381 IBE). No one — not the operator, not the settler — can read an order until the beacon publishes R. The key is held by no one.",
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
  { n: "01", title: "Seal", body: "Encrypt your order to a future drand round R and submit the opaque ciphertext on-chain. It's unreadable by everyone." },
  { n: "02", title: "Wait for round R", body: "The decryption key is a drand beacon signature held by no one — it only exists once the network publishes round R." },
  { n: "03", title: "Reveal & clear", body: "At R the batch is decrypted and settles on-chain at one uniform price. Same price for everyone, no ordering edge." },
]

export const WHY_STELLAR = [
  { title: "Native BLS12-381", body: "Soroban host functions make the timelock primitive practical on-chain — the gate exists because of capabilities unique to this network." },
  { title: "Live on-chain BLS-verifying relay", body: "The drand relay runs a full BLS pairing check before storing each round, so even its operator can't commit a forged key." },
  { title: "~5s finality, sub-cent fees", body: "Fast, cheap settlement makes frequent batch auctions practical instead of theoretical." },
  { title: "Native USDC", body: "Real-world settlement rails — payroll, institutional flow — where fairness is a requirement, not a nice-to-have." },
]

export const HIDDEN = ["Order side (buy / sell)", "Order amount", "Limit price"]
export const NOT_HIDDEN = ["Participant addresses", "Order count per batch", "Submission timing"]

export const TRUST = [
  { label: "Confidentiality", verdict: "Trustless & temporal", body: "Guaranteed by the timelock — secret until R, public after — not by any operator's promise." },
  { label: "Clearing price", verdict: "Trustless", body: "Computed on-chain by the contract, never by the settler." },
  { label: "Settlement integrity", verdict: "v1-optimistic, publicly auditable", body: "The settler is trusted to decrypt & include orders; because sigma_R is public after R, anyone can recompute the full decryption and detect a misreport. On-chain enforcement is roadmap." },
]

export const CREDIBILITY = [
  `${CRYPTO.tests} unit tests`,
  "Live on testnet",
  "Verifiable on stellar.expert",
  "Open source · MIT",
  "Main + Privacy tracks",
]
