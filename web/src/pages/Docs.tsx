import { useEffect, useState, type ReactNode } from "react"
import { Button } from "../components/primitives"
import {
  ADDRESSES,
  contractUrl,
  CRYPTO,
  HIDDEN,
  LINKS,
  MARKET,
  NETWORK,
  NOT_HIDDEN,
  REVENUE,
  shortAddr,
  TRUST,
} from "../data/content"
import { navigate } from "../lib/router"

// Comprehensive developer documentation — docs-style layout (sticky sidebar with
// scrollspy + readable content column). All facts are sourced from the contract,
// DECISIONS.md (ADRs) and SUBMISSION.md; addresses are the live testnet deploy.

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  {
    group: "Introduction",
    items: [
      { id: "overview", label: "Overview" },
      { id: "how", label: "How it works" },
      { id: "architecture", label: "Architecture" },
      { id: "lifecycle", label: "Order lifecycle" },
    ],
  },
  {
    group: "Settlement engine",
    items: [
      { id: "settle", label: "Settlement flow" },
      { id: "conservation", label: "Conservation & invariants" },
      { id: "fee", label: "Protocol fee" },
    ],
  },
  {
    group: "Compliance & privacy",
    items: [
      { id: "permissioned", label: "Permissioned / KYC" },
      { id: "privacy", label: "Privacy disclosures" },
      { id: "trust", label: "Trust boundary" },
    ],
  },
  {
    group: "Reference",
    items: [
      { id: "contract", label: "Contract reference" },
      { id: "addresses", label: "Deployed addresses" },
      { id: "run", label: "Run it" },
      { id: "api", label: "Demo backend API" },
      { id: "market", label: "Market & business" },
      { id: "roadmap", label: "Roadmap" },
      { id: "sources", label: "References" },
    ],
  },
]
const ALL_IDS = NAV.flatMap((g) => g.items.map((i) => i.id))

export default function Docs() {
  const [active, setActive] = useState("overview")

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting)
        if (vis.length) {
          vis.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          setActive(vis[0].target.id)
        }
      },
      { rootMargin: "-100px 0px -62% 0px", threshold: [0, 1] },
    )
    ALL_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActive(id)
  }

  return (
    <main className="mx-auto w-full max-w-content px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <header className="mb-8">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-sealed-300">Documentation</div>
        <h1 className="mt-2 text-h2">Stelvin developer docs</h1>
        <p className="mt-3 max-w-2xl text-text-dim">
          A sealed-bid batch DEX / on-chain dark pool on Stellar Soroban. This covers the protocol, the
          settlement engine and its invariants, the permissioned-RWA + fee model, the full contract reference,
          and how to run everything against live testnet.
        </p>
      </header>

      {/* mobile section jump */}
      <div className="mb-6 lg:hidden">
        <select
          value={active}
          onChange={(e) => go(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          {NAV.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* sidebar */}
        <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
          <nav className="space-y-5">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-text-muted">{g.group}</div>
                <ul className="space-y-0.5 border-l border-border">
                  {g.items.map((i) => (
                    <li key={i.id}>
                      <button
                        onClick={() => go(i.id)}
                        className={
                          "-ml-px block border-l-2 py-1.5 pl-3 text-left text-sm transition-colors " +
                          (active === i.id
                            ? "border-sealed text-text"
                            : "border-transparent text-text-muted hover:text-text-dim")
                        }
                      >
                        {i.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* content */}
        <article className="min-w-0">
          <Content />
        </article>
      </div>
    </main>
  )
}

/* ─────────────────────────── primitives ─────────────────────────── */
function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 100 }} className="mt-12 border-t border-border/60 pt-10 first:mt-0 first:border-0 first:pt-0">
      <h2 className="text-h3 font-semibold text-text">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-text-dim">{children}</div>
    </section>
  )
}
function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.84em] text-sealed-300">{children}</code>
}
function Code({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-[var(--radius-sm)] border border-border bg-bg/70 p-4 font-mono text-xs leading-relaxed text-text-dim">
      <code>{children}</code>
    </pre>
  )
}
function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 text-base font-semibold text-text">{children}</h3>
}
function Note({ children, tone = "sealed" }: { children: ReactNode; tone?: "sealed" | "revealed" | "attack" }) {
  const c = tone === "revealed" ? "border-revealed/40 bg-revealed/5" : tone === "attack" ? "border-attack/40 bg-attack/5" : "border-sealed/40 bg-sealed/5"
  return <div className={"rounded-[var(--radius-sm)] border px-4 py-3 text-sm " + c}>{children}</div>
}
function Rows({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface/70 text-left">
            {head.map((h) => (
              <th key={h} className="border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-text-muted">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((cell, j) => (
                <td key={j} className="border-b border-border/50 px-3 py-2 text-text-dim">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Ext({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="text-revealed underline-offset-2 hover:underline">{children}</a>
}

/* ─────────────────────────── content ─────────────────────────── */
function Content() {
  return (
    <>
      <Sec id="overview" title="Overview">
        <p>
          <span className="text-text">Stelvin</span> is a sealed-bid, uniform-price <span className="text-text">batch auction</span>{" "}
          on Stellar Soroban — positioned as an on-chain dark pool for tokenized RWAs and institutional flows.
          Orders are <span className="text-text">drand-timelock-encrypted</span> and unreadable by anyone — operator and
          settler included — until a committed drand round <C>R</C>. At <C>R</C> the whole batch clears at one price
          computed on-chain. A frontrunner has nothing to react to, so MEV isn't promised away — within a batch it is
          cryptographically impossible to react to.
        </p>
        <Note>
          <b className="text-text">Precise claim.</b> <i>Intra-batch</i> frontrunning and sandwiching are cryptographically
          eliminated (nothing to see before reveal, no ordering edge at settlement). Cross-batch effects and uniform-auction
          game theory are ordinary public-market phenomena, not victim-specific MEV — we don't claim otherwise.
        </Note>
        <p>Tracks: <b className="text-text">Main</b> (automatic) + <b className="text-text">Privacy</b> (primary). {CRYPTO.tests} unit tests; live on testnet.</p>
      </Sec>

      <Sec id="how" title="How it works — two layers">
        <p>Stelvin protects with two independent layers, and we're precise about what each does:</p>
        <H3>1 · Timelock encryption (hides order contents)</H3>
        <p>
          Desks encrypt <C>{`{ side, amount, limit_price }`}</C> to a future drand round <C>R</C> with <C>tlock</C>{" "}
          (Boneh-Franklin IBE over BLS12-381, drand quicknet <C>{CRYPTO.scheme}</C>). The decryption key is held by{" "}
          <b className="text-text">no one</b> — it is the beacon signature published at <C>R</C>. Until then, no party
          (operator or settler) can read an order.
        </p>
        <H3>2 · Uniform-price batch clearing (removes ordering advantage)</H3>
        <p>
          At <C>R</C> the whole batch clears at a single price <C>P*</C> that the <b className="text-text">contract</b>{" "}
          computes — not the settler. There is no "first in line" edge, and the settler cannot move the price.
        </p>
      </Sec>

      <Sec id="architecture" title="Architecture">
        <p>Three parts we build, plus one external oracle we only call:</p>
        <Rows
          head={["Component", "Role", "Tech"]}
          rows={[
            [<b className="text-text">BatchGate + Escrow</b>, "Sealed orders, standing-balance escrow, timing/key gate, on-chain uniform-price matching, conservation-safe settlement, permissioned KYC, protocol fee", "Rust / Soroban"],
            [<b className="text-text">Settler + demo</b>, "tlock encrypt → submit → decrypt at reveal → call settle; SSE demo backend", "TypeScript · tlock-js"],
            [<b className="text-text">Frontend</b>, "Landing, live demo, this documentation", "Vite + React"],
            [<>Drand-Relay <span className="text-text-muted">(called)</span></>, "Timing + key oracle — a live, on-chain BLS-verifying drand relay. Not redeployed.", "Soroban (external)"],
            [<>Noether oracle <span className="text-text-muted">(called)</span></>, "SEP-40 fair-value reference, display-only & non-blocking", "Soroban (external)"],
          ]}
        />
        <p>
          The relay stores only <C>sha256(sig_R)</C>; the raw 48-byte compressed <C>sigma_R</C> (which is both the tlock
          decryption key and the on-chain key-check input) is fetched from the public quicknet API.
        </p>
      </Sec>

      <Sec id="lifecycle" title="Order lifecycle">
        <p>How a desk uses the venue, end to end:</p>
        <Rows
          head={["Step", "Action", "Auth"]}
          rows={[
            ["1 · KYC", <>Issuer/compliance allowlists the desk (<C>set_kyc</C>)</>, "admin"],
            ["2 · Deposit", <>Fund a standing balance (<C>deposit_funds</C>) — SAC pull</>, "trader"],
            ["3 · Seal", <>Encrypt the order to round <C>R</C>, submit the opaque ciphertext (<C>submit_order</C>)</>, "trader"],
            ["4 · Wait", <>The beacon publishes <C>R</C> (~12+ rounds ahead; ~36s+)</>, "—"],
            ["5 · Clear", <>Anyone settles: decrypt batch, match, one uniform price (<C>settle</C>)</>, "permissionless"],
            ["6 · Withdraw", <>Withdraw realized balance (<C>withdraw</C>) — SAC push</>, "trader"],
          ]}
        />
      </Sec>

      <Sec id="settle" title="Settlement flow">
        <p>
          <C>settle(batch_id, sigma_r, revealed[])</C> is permissionless — the timing gate and key check stop a malicious
          caller from settling early or with a fake key, and the price is computed on-chain. Steps:
        </p>
        <Rows
          head={["Step", "What happens"]}
          rows={[
            [<b className="text-text">a + b</b>, <>Timing gate + key authenticity in one relay read: <C>committed = relay.get(R)</C> (a <C>Some</C> proves R arrived <i>and</i> the key is BLS-verified), then assert <C>sha256(sigma_r) == committed</C>.</>],
            [<b className="text-text">c</b>, <>(skipped) Independent on-chain BLS pairing — redundant; the relay already verified.</>],
            [<b className="text-text">d</b>, <>Trust the revealed <C>side/amount/price</C> (v1-optimistic); the <b className="text-text">trader is read from storage</b>, never the settler. Duplicate <C>order_id</C>s rejected.</>],
            [<b className="text-text">e</b>, <>On-chain match: candidate-price scan → <C>P*</C> (max matched volume) → eligibility → global feasibility scalar <C>r</C> → floor-then-trim fills → ceil/floor quote + protocol fee.</>],
            [<b className="text-text">f</b>, <>Write <C>Clearing</C>, set <C>Settled</C>, emit <C>BatchSettled</C>.</>],
          ]}
        />
        <p>
          Clearing price <C>P*</C> is the submitted limit that maximizes matched volume; ties break to smaller{" "}
          <C>|demand − supply|</C>, then the lower (buyer-favoring) price. The long side is pro-rated.
        </p>
      </Sec>

      <Sec id="conservation" title="Conservation & invariants">
        <p>The internal ledger never mints or burns value, and <C>settle</C> never reverts. Three constructions guarantee it:</p>
        <ul className="ml-1 space-y-2">
          <li>• <b className="text-text">Global feasibility scalar</b> <C>r ∈ [0,1]</C> = min over eligible orders of <C>feasible / raw_fill</C>. Scaling both sides by the same <C>r</C> keeps the book balanced.</li>
          <li>• <b className="text-text">Floor-then-trim</b>: each fill is floored within the trader's balance; the larger side is trimmed to <C>traded = min(Σbuy, Σsell)</C> so <C>Σbuy == Σsell == traded</C> exactly (base conserves exactly).</li>
          <li>• <b className="text-text">Safe quote direction</b>: buyers pay <C>⌈base·P*/SCALE⌉</C>, sellers receive <C>⌊…⌋</C> minus the fee, so the pool only ever retains a non-negative residual.</li>
        </ul>
        <Note tone="revealed">
          <b className="text-text">Revert-proof, not just non-negative.</b> Feasibility is computed against a balance snapshot;
          enforcing <b className="text-text">one order per trader per batch</b> makes snapshot == apply-time balance, so the
          floor bound holds at apply time. Covered by dedicated conservation + no-revert tests.
        </Note>
      </Sec>

      <Sec id="fee" title="Protocol fee (ADR-018)">
        <p>
          An admin-configurable fee in basis points (<C>set_fee_bps</C>, default <C>0</C>, capped at 10%). It is taken from
          the <b className="text-text">quote leg only</b> and credited to an admin-withdrawable ledger — value redistribution,
          not creation, so conservation holds:
        </p>
        <Code>buyer pays  ⌈base·P*/SCALE⌉
seller gets ⌊base·P*/SCALE⌋ · (10000 − fee_bps)/10000   (floored)
protocol_fee = Σ buy_quote − Σ seller_quote     ( ≥ 0, the residual )

⇒  Σ buy_quote == Σ seller_quote + protocol_fee     (base untouched)</Code>
        <p>
          With <C>fee_bps = 0</C> the residual is just rounding dust, so prior behavior is identical. The demo runs a
          CoW-matched <b className="text-text">2 bps</b> on a block trade; the accrued fee is real and withdrawable via{" "}
          <C>withdraw_fees</C>. Surplus capture (a share of price-improvement vs a reference) is roadmap — it needs a
          reference price, so we don't claim it.
        </p>
      </Sec>

      <Sec id="permissioned" title="Permissioned / KYC (RWA · ADR-017)">
        <p>
          RWA tokens are permissioned — held only by vetted addresses. The contract is asset-agnostic, so the demo points{" "}
          <C>asset_base</C> at a tokenized US T-bill (<C>tUSTB</C>) vs USDC near par. A backward-compatible KYC allowlist gates
          who may fund/submit:
        </p>
        <ul className="ml-1 space-y-2">
          <li>• <C>set_permissioned(enabled)</C> — admin toggle; default <b className="text-text">off</b> = open (legacy behavior unchanged).</li>
          <li>• <C>set_kyc(trader, allowed)</C> — issuer/compliance allowlist.</li>
          <li>• <C>deposit_funds</C> / <C>submit_order</C> call <C>require_kyc</C>, a no-op while permissioned is off.</li>
        </ul>
        <p>In the live demo the gate is on, the desks are allowlisted, and an un-KYC'd address is <b className="text-text">rejected on-chain</b>.</p>
        <Note tone="attack">
          We do <b className="text-text">not</b> claim auditor-only selective disclosure — it doesn't fit a timelock (privacy
          here is temporal: hidden from everyone until <C>R</C>, then public to everyone). The compliance posture is
          post-trade transparency + the on-chain KYC gate.
        </Note>
      </Sec>

      <Sec id="privacy" title="Privacy disclosures">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <H3>Hidden until R</H3>
            <ul className="ml-1 space-y-1.5">{HIDDEN.map((x) => <li key={x}>• {x}</li>)}</ul>
            <p className="mt-2 text-sm text-text-muted">From everyone — all participants and the operator/settler — until the beacon publishes <C>R</C>.</p>
          </div>
          <div>
            <H3>Public (stated up front)</H3>
            <ul className="ml-1 space-y-1.5">{NOT_HIDDEN.map((x) => <li key={x}>○ {x}</li>)}</ul>
            <p className="mt-2 text-sm text-text-muted">Stelvin hides <i>what</i> you trade, not <i>that</i> you placed an order. Participant-graph privacy is future work.</p>
          </div>
        </div>
        <p>
          <b className="text-text">Technique:</b> drand timelock encryption (<C>tlock</C>, Boneh-Franklin IBE / BLS12-381),
          drand quicknet (3s period). <b className="text-text">Threat model:</b> a mempool-watching frontrunning / sandwich /
          MEV adversary. <b className="text-text">Assumptions:</b> drand quicknet liveness + BLS unforgeability, plus the
          relay's permissionless, BLS-verified <C>push</C>.
        </p>
      </Sec>

      <Sec id="trust" title="Trust boundary">
        <Rows
          head={["Property", "Verdict", "Why"]}
          rows={TRUST.map((t) => [<b className="text-text">{t.label}</b>, <span className="text-revealed">{t.verdict}</span>, t.body])}
        />
        <p>We do <b className="text-text">not</b> claim trustless on-chain reveal — decryption is off-chain but publicly verifiable from the public <C>sigma_R</C>.</p>
      </Sec>

      <Sec id="contract" title="Contract reference (BatchGate + Escrow)">
        <H3>Functions</H3>
        <Rows
          head={["fn", "auth", "purpose"]}
          rows={[
            [<C>__constructor(admin, asset_base, asset_quote, relay)</C>, "deploy", "one-time config"],
            [<C>deposit_funds(trader, asset, amount)</C>, "trader", "fund standing balance (SAC pull); KYC-gated when permissioned"],
            [<C>withdraw(trader, asset, amount)</C>, "trader", "withdraw free balance (SAC push)"],
            [<C>set_permissioned(enabled)</C>, "admin", "toggle RWA/KYC mode (ADR-017)"],
            [<C>set_kyc(trader, allowed)</C>, "admin", "KYC allowlist (issuer/compliance)"],
            [<C>set_fee_bps(bps)</C>, "admin", "protocol fee, default 0, cap 1000 (ADR-018)"],
            [<C>withdraw_fees(to, asset, amount)</C>, "admin", "withdraw accrued protocol fees"],
            [<C>create_batch(reveal_round)</C>, "admin", "open a batch for round R"],
            [<C>submit_order(trader, batch_id, ciphertext)</C>, "trader", "sealed order; funded + one-per-trader; KYC-gated"],
            [<C>lock_batch(batch_id)</C>, "permissionless", "freeze once R available"],
            [<C>settle(batch_id, sigma_r, revealed[])</C>, "permissionless", "gate → match → settle"],
            [<C>get_* / is_kyc / get_fee_bps / get_fees</C>, "view", "reads"],
          ]}
        />
        <H3>Events</H3>
        <p className="text-sm">
          <C>BatchOpened</C>, <C>OrderSubmitted</C>, <C>BatchSettled</C> (topic-indexed by <C>batch_id</C>);{" "}
          <C>PermissionedSet</C>, <C>KycSet</C> (ADR-017); <C>FeeBpsSet</C>, <C>FeesAccrued</C> (ADR-018).
        </p>
        <H3>Key constants</H3>
        <p className="text-sm">
          <C>PRICE_SCALE = 1e7</C> · <C>FEAS_SCALE = 1e9</C> · <C>MAX_ORDERS = 16</C> ·{" "}
          <C>FUTURE_ROUND_BUFFER = 12</C> · <C>MAX_FEE_BPS = 1000</C> · target <C>{CRYPTO.target}</C> ({CRYPTO.wasmBytes} bytes).
        </p>
      </Sec>

      <Sec id="addresses" title="Deployed addresses (testnet)">
        <Rows
          head={["Contract", "Address"]}
          rows={[
            [<b className="text-text">BatchGate</b>, <Ext href={contractUrl(ADDRESSES.batchGate)}>{shortAddr(ADDRESSES.batchGate)} ↗</Ext>],
            ["tUSTB SAC", <Ext href={contractUrl(ADDRESSES.tustbSac)}>{shortAddr(ADDRESSES.tustbSac)} ↗</Ext>],
            ["USDC SAC", <Ext href={contractUrl(ADDRESSES.usdcSac)}>{shortAddr(ADDRESSES.usdcSac)} ↗</Ext>],
            ["Drand-Relay (oracle)", <Ext href={contractUrl(ADDRESSES.drandRelay)}>{shortAddr(ADDRESSES.drandRelay)} ↗</Ext>],
            ["Noether oracle", <Ext href={contractUrl(ADDRESSES.noetherOracle)}>{shortAddr(ADDRESSES.noetherOracle)} ↗</Ext>],
          ]}
        />
        <p className="text-sm">
          Network: <b className="text-text">testnet</b> · RPC <C>{NETWORK.rpc}</C> · passphrase <C>{NETWORK.passphrase}</C>.
        </p>
      </Sec>

      <Sec id="run" title="Run it">
        <H3>Contract tests + one-command e2e</H3>
        <Code>cargo test -p batch-gate          # {CRYPTO.tests} unit tests
bash scripts/deploy_and_smoke.sh   # deploy + RWA/KYC/fee e2e on testnet</Code>
        <H3>Demo (backend + frontend)</H3>
        <Code>cd settler && npm install && npm run server   # SSE backend  :8787
cd web     && npm install && npm run dev      # frontend     :5173
cd settler && npm run demo                    # CLI frontrunner showdown</Code>
        <p className="text-sm">Point the web demo at a deployed backend with <C>?backend=https://…</C> on the demo URL.</p>
      </Sec>

      <Sec id="api" title="Demo backend API">
        <p>A thin Express server reuses the settler helpers and runs the real on-chain flow, streaming progress as Server-Sent Events.</p>
        <Rows
          head={["Endpoint", "Description"]}
          rows={[
            [<C>GET /api/health</C>, "liveness + active GATE address"],
            [<C>GET /api/demo</C>, "SSE stream of a full live run (see events below)"],
            [<C>GET /api/kyc?address=G…</C>, "demo desk onboarding — admin allowlists the address (demo-only)"],
          ]}
        />
        <H3>SSE event types</H3>
        <p className="text-sm">
          <C>left_init</C>, <C>left_result</C> (simulated AMM sandwich) · <C>kyc</C>, <C>kyc_reject</C> ·{" "}
          <C>batch_opened</C>, <C>orders_submitted</C> · <C>bot_attempt</C> (countdown) · <C>reveal</C>, <C>decrypted</C> ·{" "}
          <C>settled</C> (price, gains, <C>feeQuote</C>/<C>feeBps</C>, NAV) · <C>oracle</C> · <C>done</C> / <C>error</C>.
        </p>
      </Sec>

      <Sec id="market" title="Market & business model">
        <Rows
          head={["Layer", "Figure", "Read"]}
          rows={MARKET.map((m) => [<b className="text-text">{m.tier}</b>, <span className="text-revealed">{m.value}</span>, <span>{m.body} <span className="text-text-muted">({m.src})</span></span>])}
        />
        <H3>Revenue model</H3>
        <ul className="ml-1 space-y-1.5">{REVENUE.map((r) => <li key={r}>• {r}</li>)}</ul>
        <p className="text-sm text-text-muted">
          Honest bottom line: Stellar-native MEV is marginal today; the bet is proactive infrastructure for the segment
          Stellar is winning (RWA/institutional). The CoW comp (~$93.5M mcap / ~$15.6M-yr) is real evidence of the ceiling.
        </p>
      </Sec>

      <Sec id="roadmap" title="Roadmap">
        <ul className="ml-1 space-y-1.5">
          <li>• On-chain BLS / fraud-proof for decrypt-correctness (remove the v1-optimistic settler trust).</li>
          <li>• Surplus capture (reference-priced) in addition to the live <C>fee_bps</C>.</li>
          <li>• Wallet-signed self-submit + passkey smart-wallet auth (Phase B — read-only connect shipped).</li>
          <li>• Multi-order-per-trader (per-trader feasibility aggregation); paginated settle beyond 16 orders.</li>
          <li>• Participant-graph privacy (stealth addresses / shielded pool); anchor & RWA-issuer integration.</li>
        </ul>
      </Sec>

      <Sec id="sources" title="References">
        <ul className="ml-1 space-y-1.5 text-sm">
          <li>• Repo docs: <C>DECISIONS.md</C> (18 ADRs), <C>SUBMISSION.md</C>, <C>README.md</C>.</li>
          <li>• drand quicknet · <C>{CRYPTO.scheme}</C> · <Ext href="https://drand.love">drand.love</Ext>.</li>
          <li>• Budish–Cramton–Shim, <i>Frequent Batch Auctions</i> (the economic primitive).</li>
          <li>• Inspect everything on <Ext href={LINKS.explorer}>stellar.expert (testnet)</Ext>.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => navigate("/demo")}>Watch the live demo →</Button>
          <Button variant="ghost" href={LINKS.github}>GitHub ↗</Button>
        </div>
      </Sec>
    </>
  )
}
