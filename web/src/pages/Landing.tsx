import { motion } from "motion/react"
import { BeaconPulse } from "../components/BeaconPulse"
import { Button, Eyebrow, Pill, Reveal, Section, ShinyText, SpotlightCard } from "../components/primitives"
import { navigate } from "../lib/router"
import { LogoMark } from "../components/Logo"
import {
  ADDRESSES,
  COMPLIANCE,
  contractUrl,
  CREDIBILITY,
  CRYPTO,
  HERO,
  HIDDEN,
  HOW_STEPS,
  LINKS,
  MARKET,
  NOT_HIDDEN,
  REVENUE,
  SANDWICH,
  shortAddr,
  TRUST,
  TWO_LAYERS,
  USE_CASES,
  WHY_STELLAR,
} from "../data/content"

export default function Landing() {
  return (
    <main className="relative">
      <Hero />
      <Problem />
      <Solution />
      <LiveProof />
      <HowItWorks />
      <UseCases />
      <WhyStellar />
      <Honesty />
      <Ecosystem />
      <Market />
      <Credibility />
    </main>
  )
}

/* ─────────────────────────── Hero ─────────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 sm:pt-40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[680px] grid-faint opacity-60" />
      <div className="mx-auto grid max-w-content items-center gap-12 px-5 pb-20 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 flex flex-wrap items-center gap-3"
          >
            <Pill tone="sealed">Tokenized RWA · Stellar</Pill>
            <Pill tone="neutral">Main + Privacy</Pill>
          </motion.div>

          <h1 className="text-display font-bold">
            {HERO.tagline.map((line, i) => (
              <motion.span
                key={line}
                className="block"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.08 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {i === 2 ? <span className="text-brand-gradient">{line}</span> : line}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-text-dim"
          >
            {HERO.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.62 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button size="lg" onClick={() => navigate("/demo")}>
              {HERO.cta} <span aria-hidden>→</span>
            </Button>
            <Button size="lg" variant="ghost" href="#how">
              How it works
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-7 font-mono text-xs text-text-muted"
          >
            ~90s end-to-end · {CRYPTO.beacon} · {CRYPTO.scheme}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto hidden aspect-square w-full max-w-md place-items-center lg:grid"
        >
          <div className="absolute inset-8 rounded-full border border-border/60" />
          <div className="absolute inset-16 rounded-full border border-border/40" />
          <BeaconPulse className="h-72 w-72" />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.3em] text-text-muted">
            sealed → reveal @ round R
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ─────────────────────────── Problem ─────────────────────────── */
function Problem() {
  return (
    <Section id="problem">
      <Reveal>
        <Eyebrow>The problem</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">
          Every order is visible the moment you send it. Bots jump ahead — and bend the price against you.
        </h2>
        <p className="mt-4 max-w-2xl text-text-dim">
          Frontrunning and sandwiching extract billions every year. A bot can only react to an order it can{" "}
          <span className="text-text">see</span>. Here's exactly that, with real mechanics:
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
        <SpotlightCard tone="attack" className="ring-grad overflow-hidden p-0">
          <div className="grid gap-px bg-border/40 sm:grid-cols-3">
            {[
              { k: "1 · Front-run", v: "bot buys ahead", d: "price pushed up before you fill" },
              { k: "2 · Victim fills", v: "worse price", d: `you lose ${SANDWICH.victimLoss} ${SANDWICH.asset} to slippage` },
              { k: "3 · Back-run", v: "bot sells", d: `bot pockets ${SANDWICH.botProfit} ${SANDWICH.quote}` },
            ].map((s) => (
              <div key={s.k} className="bg-surface/80 p-6">
                <div className="font-mono text-xs uppercase tracking-widest text-attack">{s.k}</div>
                <div className="mt-2 text-h3 font-semibold text-text">{s.v}</div>
                <div className="mt-1 text-sm text-text-muted">{s.d}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-attack/10 px-6 py-4">
            <span className="text-sm text-text-dim">A single sandwiched order on a transparent AMM:</span>
            <span className="font-mono text-sm">
              <span className="text-attack">bot {SANDWICH.botProfit} {SANDWICH.quote}</span>
              <span className="mx-2 text-text-muted">·</span>
              <span className="text-text-dim">victim −{SANDWICH.victimLoss} {SANDWICH.asset}</span>
            </span>
          </div>
        </SpotlightCard>
      </Reveal>
    </Section>
  )
}

/* ─────────────────────────── Solution ─────────────────────────── */
function Solution() {
  return (
    <Section className="relative">
      <Reveal>
        <Eyebrow tone="revealed">The solution — two layers</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">
          Hide the order, then clear everyone at <span className="text-revealed-gradient">one fair price.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-text-dim">
          We're precise about what each layer does — and we don't overclaim.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {TWO_LAYERS.map((layer, i) => (
          <Reveal key={layer.title} delay={0.08 * i}>
            <SpotlightCard tone={layer.state} className="ring-grad h-full">
              <div className="flex items-center justify-between">
                <span
                  className={
                    "grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] border " +
                    (layer.state === "revealed"
                      ? "border-revealed/40 bg-revealed/10 text-revealed"
                      : "border-sealed/40 bg-sealed/10 text-sealed-300")
                  }
                >
                  {layer.state === "revealed" ? <RevealGlyph /> : <SealGlyph />}
                </span>
                <Pill tone={layer.state}>{layer.tag}</Pill>
              </div>
              <h3 className="mt-5 text-h3 font-semibold">{layer.title}</h3>
              <p className="mt-3 text-text-dim">{layer.body}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.12}>
        <p className="mx-auto mt-8 max-w-3xl rounded-[var(--radius)] border border-border bg-surface/40 p-5 text-center text-sm text-text-dim">
          <span className="font-medium text-text">Precise claim:</span> intra-batch frontrunning and sandwiching are{" "}
          <span className="text-revealed">cryptographically eliminated</span> — nothing to see before reveal, no
          ordering edge at settlement. Cross-batch effects and auction game theory are ordinary public-market phenomena;
          we don't claim otherwise.
        </p>
      </Reveal>
    </Section>
  )
}

/* ─────────────────────────── Live proof ─────────────────────────── */
function LiveProof() {
  return (
    <Section>
      <Reveal>
        <SpotlightCard tone="revealed" className="ring-grad overflow-hidden">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <Eyebrow tone="revealed">Live proof</Eyebrow>
              <h2 className="mt-4 text-h2">Run one bot against both markets. Watch it fail on ours.</h2>
              <p className="mt-4 max-w-xl text-text-dim">
                The same bot pulls the actual on-chain order and runs real <span className="font-mono text-text">tlock</span> decrypt —
                it returns <span className="text-warn">"too early to decrypt"</span> on every attempt until the drand
                beacon publishes round R. Then the batch settles at a single uniform price.{" "}
                <span className="text-text">Frontrun attempts: 0 successful.</span>
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button size="lg" variant="revealed" onClick={() => navigate("/demo")}>
                  Watch the live demo <span aria-hidden>→</span>
                </Button>
                <Pill tone="neutral">~90s end-to-end</Pill>
              </div>
            </div>
            <div className="hidden md:block">
              <BotTerminal />
            </div>
          </div>
          <div className="mt-6 md:hidden">
            <BotTerminal />
          </div>
        </SpotlightCard>
      </Reveal>
    </Section>
  )
}

function BotTerminal() {
  const lines = [
    { t: "bot attempt #1", v: "too early to decrypt", c: "warn" },
    { t: "bot attempt #2", v: "too early to decrypt", c: "warn" },
    { t: "bot attempt #3", v: "too early to decrypt", c: "warn" },
    { t: "round R reached", v: "beacon publishes", c: "revealed" },
    { t: "settled", v: "one uniform price P*", c: "revealed" },
  ]
  return (
    <div className="w-full max-w-sm rounded-[var(--radius)] border border-border bg-bg/80 font-mono text-xs shadow-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-attack/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-revealed/70" />
        <span className="ml-2 text-text-muted">frontrunner-bot</span>
      </div>
      <div className="space-y-1.5 p-4">
        {lines.map((l, i) => (
          <motion.div
            key={l.t}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12 }}
            className="flex items-center justify-between gap-3"
          >
            <span className="text-text-muted">{l.t}</span>
            <span className={l.c === "warn" ? "text-warn" : "text-revealed"}>
              {l.c === "warn" ? "✗ " : "✓ "}
              {l.v}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────── How it works ─────────────────────────── */
function HowItWorks() {
  return (
    <Section id="how">
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-4 max-w-2xl text-h2">Seal → wait for round R → reveal &amp; clear at one price.</h2>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {HOW_STEPS.map((s, i) => (
          <Reveal key={s.n} delay={0.08 * i}>
            <div className="relative h-full rounded-[var(--radius)] border border-border bg-surface/50 p-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-sealed-300">{s.n}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-sealed/50 to-transparent" />
              </div>
              <h3 className="mt-4 text-h3 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-text-dim">{s.body}</p>
              {i < HOW_STEPS.length - 1 && (
                <span className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-text-muted md:block">→</span>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

/* ─────────────────────────── Why Stellar ─────────────────────────── */
function WhyStellar() {
  return (
    <Section className="relative">
      <Reveal>
        <Eyebrow tone="revealed">Why Stellar</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">The timelock gate exists because of rails unique to this network.</h2>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WHY_STELLAR.map((w, i) => (
          <Reveal key={w.title} delay={0.06 * i}>
            <div className="h-full rounded-[var(--radius)] border border-border bg-surface/40 p-5">
              <h3 className="text-base font-semibold text-text">{w.title}</h3>
              <p className="mt-2 text-sm text-text-muted">{w.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

/* ─────────────────────────── Honesty band ─────────────────────────── */
function Honesty() {
  return (
    <Section id="honesty">
      <Reveal>
        <Eyebrow>Radical honesty</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">What we hide — and what we don't.</h2>
        <p className="mt-4 max-w-2xl text-text-dim">
          Being this explicit is rare. It's also the point: the guarantee is only as good as the precision of the claim.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Reveal>
          <SpotlightCard tone="sealed" className="h-full">
            <div className="flex items-center gap-2 text-sealed-300">
              <SealGlyph /> <span className="font-mono text-xs uppercase tracking-widest">Hidden until R</span>
            </div>
            <ul className="mt-4 space-y-2.5">
              {HIDDEN.map((x) => (
                <li key={x} className="flex items-center gap-2.5 text-text-dim">
                  <span className="text-sealed">●</span> {x}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-text-muted">From everyone — all participants and the operator / settler — until the beacon publishes round R.</p>
          </SpotlightCard>
        </Reveal>
        <Reveal delay={0.08}>
          <SpotlightCard tone="neutral" className="h-full">
            <div className="flex items-center gap-2 text-text-dim">
              <EyeGlyph /> <span className="font-mono text-xs uppercase tracking-widest">Public (stated up front)</span>
            </div>
            <ul className="mt-4 space-y-2.5">
              {NOT_HIDDEN.map((x) => (
                <li key={x} className="flex items-center gap-2.5 text-text-dim">
                  <span className="text-text-muted">○</span> {x}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-text-muted">Stelvin hides <span className="text-text">what</span> you trade, not <span className="text-text">that</span> you placed an order. Participant-graph privacy is future work.</p>
          </SpotlightCard>
        </Reveal>
      </div>

      <Reveal delay={0.1} className="mt-5">
        <div className="grid gap-px overflow-hidden rounded-[var(--radius)] border border-border bg-border/40 sm:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.label} className="bg-surface/70 p-5">
              <div className="font-mono text-xs uppercase tracking-widest text-text-muted">{t.label}</div>
              <div className="mt-1.5 font-semibold text-revealed">{t.verdict}</div>
              <p className="mt-2 text-sm text-text-muted">{t.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-text-muted">
          We do <span className="text-text">not</span> claim trustless on-chain reveal.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mt-5">
        <div className="rounded-[var(--radius)] border border-sealed/30 bg-sealed/5 p-5">
          <div className="font-mono text-xs uppercase tracking-widest text-sealed-300">{COMPLIANCE.title}</div>
          <p className="mt-2 text-sm text-text-dim">{COMPLIANCE.body}</p>
        </div>
      </Reveal>
    </Section>
  )
}

/* ─────────────────────────── Ecosystem ─────────────────────────── */
function Ecosystem() {
  const items = [
    {
      name: "Drand-Relay",
      role: "Timing & key oracle (called, not redeployed)",
      body: "A live, on-chain BLS-verifying drand relay. It runs a full pairing check before storing each round — so a Some result is both proof the round arrived and that the key is authentic.",
      addr: ADDRESSES.drandRelay,
      tone: "sealed" as const,
    },
    {
      name: "Noether SEP-40 oracle",
      role: "Fair-value reference (SCF #41 perp DEX)",
      body: "After each batch settles, Stelvin reads Noether's deployed on-chain oracle as a live fair-value sanity check next to its clearing price. Display-only, permissionless, strictly non-blocking.",
      addr: ADDRESSES.noetherOracle,
      tone: "revealed" as const,
    },
  ]
  return (
    <Section id="ecosystem">
      <Reveal>
        <Eyebrow>Built on Stellar · composes with the ecosystem</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">One contract, on top of live infrastructure.</h2>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {items.map((it, i) => (
          <Reveal key={it.name} delay={0.08 * i}>
            <SpotlightCard tone={it.tone} className="ring-grad h-full">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-h3 font-semibold">{it.name}</h3>
                  <div className="mt-1 text-sm text-text-muted">{it.role}</div>
                </div>
                <Pill tone={it.tone}>on-chain</Pill>
              </div>
              <p className="mt-4 text-text-dim">{it.body}</p>
              <a
                href={contractUrl(it.addr)}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 font-mono text-xs text-text-muted transition-colors hover:text-text"
              >
                {shortAddr(it.addr)} <span aria-hidden>↗</span>
              </a>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

/* ─────────────────────────── Credibility ─────────────────────────── */
function Credibility() {
  return (
    <Section>
      <Reveal>
        <div className="ring-grad relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-gradient-to-b from-surface/80 to-bg-soft/40 p-8 text-center sm:p-12">
          <div className="mx-auto mb-6 grid h-14 w-14 place-items-center">
            <LogoMark size={48} />
          </div>
          <h2 className="mx-auto max-w-2xl text-h2">Every number is real. Verify it yourself.</h2>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            {CREDIBILITY.map((c) => (
              <Pill key={c} tone="neutral">{c}</Pill>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/demo")}>Watch the live demo →</Button>
            <Button size="lg" variant="ghost" href={contractUrl(ADDRESSES.batchGate)}>
              BatchGate on stellar.expert ↗
            </Button>
          </div>
          <p className="mt-6 font-mono text-xs text-text-muted">
            wasm {CRYPTO.wasmBytes} bytes · {CRYPTO.target} · BatchGate {shortAddr(ADDRESSES.batchGate)}
          </p>
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="sr-only">GitHub repository</a>
        </div>
      </Reveal>
    </Section>
  )
}

/* ─────────────────────────── Use cases (RWA) ─────────────────────────── */
function UseCases() {
  return (
    <Section id="use-cases">
      <Reveal>
        <Eyebrow tone="revealed">Real-world use cases</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">Where this matters on Stellar — strongest first.</h2>
        <p className="mt-4 max-w-2xl text-text-dim">
          Stellar's DeFi growth is RWA- and institution-driven — the actors who most need intent privacy and
          fair execution on large blocks.
        </p>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {USE_CASES.map((u, i) => (
          <Reveal key={u.title} delay={0.06 * i}>
            <SpotlightCard tone={i === 0 ? "revealed" : "sealed"} className={i === 0 ? "ring-grad h-full" : "h-full"}>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                {u.rank && <Pill tone="revealed">{u.rank}</Pill>}
              </div>
              <h3 className="mt-3 text-h3 font-semibold">{u.title}</h3>
              <p className="mt-2 text-text-dim">{u.body}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

/* ─────────────────────────── Market & business ─────────────────────────── */
function Market() {
  return (
    <Section id="market">
      <Reveal>
        <Eyebrow>Market &amp; business model</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-h2">Small on Stellar today — but the right segment, growing fast.</h2>
        <p className="mt-4 max-w-2xl text-text-dim">
          No invented valuation. The direct comp shows what a sealed-batch venue can be worth; we're honest the
          Stellar-native market is early.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MARKET.map((m, i) => (
          <Reveal key={m.tier} delay={0.06 * i}>
            <div className="h-full rounded-[var(--radius)] border border-border bg-surface/50 p-5">
              <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">{m.tier}</div>
              <div className="mt-1.5 text-h3 font-semibold text-revealed">{m.value}</div>
              <p className="mt-2 text-sm text-text-muted">{m.body}</p>
              <div className="mt-3 font-mono text-[11px] text-text-muted">src: {m.src}</div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.1} className="mt-5">
        <SpotlightCard tone="sealed" className="ring-grad">
          <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
            <div>
              <h3 className="text-h3 font-semibold">Revenue model</h3>
              <p className="mt-2 text-sm text-text-muted">
                Proven by CoW Protocol — the same primitive — at ~$15.6M/yr protocol revenue.
                Stelvin's trading fee is <span className="text-revealed">already live on-chain</span> (2 bps,
                conservation-safe, admin-withdrawable).
              </p>
            </div>
            <ul className="space-y-2.5">
              {REVENUE.map((r) => (
                <li key={r} className="flex items-start gap-2.5 text-sm text-text-dim">
                  <span className="mt-1 text-revealed">▸</span> {r}
                </li>
              ))}
            </ul>
          </div>
        </SpotlightCard>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mx-auto mt-5 max-w-3xl text-center text-sm text-text-muted">
          Honest bottom line: Stelvin is early, and Stellar-native MEV is marginal today. The bet is proactive
          infrastructure for the segment Stellar is actually winning — RWA &amp; institutional — before MEV scales.
          The CoW comp (~$93.5M mcap / ~$15.6M/yr revenue) is real evidence of the ceiling.
        </p>
      </Reveal>
    </Section>
  )
}

/* ─────────────────────────── glyphs ─────────────────────────── */
function SealGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function RevealGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 7.5-1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function EyeGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
