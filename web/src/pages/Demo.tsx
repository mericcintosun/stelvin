import { useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Button, Eyebrow, Pill } from "../components/primitives"
import { ADDRESSES, contractUrl, LINKS, shortAddr } from "../data/content"
import { cn } from "../lib/cn"

// Demo backend (the existing Express SSE server in settler/src/server.ts).
// Overridable via ?backend=... so it can point at a deployed instance.
const BACKEND =
  new URLSearchParams(window.location.search).get("backend") ?? LINKS.demoBackendDefault

type Left = {
  rx: number; ru: number; aliceUSDC: number; botUSDC: number
  xFair?: number; xBot?: number; xAlice?: number; usdcBack?: number; botProfit?: number; aliceLoss?: number
}
type Attempt = { n: number; message: string; secondsLeft: number }
type Oracle = { price?: number; source?: string; stale?: boolean; unavailable?: boolean }
type Right = {
  permissioned?: boolean; kycReject?: boolean
  batchId?: number; R?: number; aoid?: number; boid?: number; ciphertext?: string; bytes?: number
  attempts: Attempt[]; revealed?: boolean
  price?: number; base?: string; nav?: number; navDeviationPct?: number
  matched?: number; aliceGainBase?: number; bobGainUsdc?: number; frontrunAttempts?: number
  oracle?: Oracle
}

export default function Demo() {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [left, setLeft] = useState<Left | null>(null)
  const [right, setRight] = useState<Right>({ attempts: [] })
  const esRef = useRef<EventSource | null>(null)

  function run() {
    esRef.current?.close()
    setRunning(true); setDone(false); setErr(null); setLeft(null); setRight({ attempts: [] })
    const es = new EventSource(`${BACKEND}/api/demo`)
    esRef.current = es
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data)
      switch (e.type) {
        case "left_init": setLeft(e); break
        case "left_result": setLeft((p) => ({ ...(p as Left), ...e })); break
        case "kyc": setRight((p) => ({ ...p, permissioned: e.permissioned })); break
        case "kyc_reject": setRight((p) => ({ ...p, kycReject: e.blocked })); break
        case "batch_opened": setRight((p) => ({ ...p, batchId: e.batchId, R: e.R })); break
        case "orders_submitted": setRight((p) => ({ ...p, aoid: e.aoid, boid: e.boid, ciphertext: e.ciphertext, bytes: e.bytes })); break
        case "bot_attempt": setRight((p) => ({ ...p, attempts: [...p.attempts, e as Attempt] })); break
        case "reveal": setRight((p) => ({ ...p, revealed: true })); break
        case "settled": setRight((p) => ({ ...p, ...e })); break
        case "oracle": setRight((p) => ({ ...p, oracle: e as Oracle })); break
        case "done": setDone(true); setRunning(false); es.close(); break
        case "error": setErr(e.message); setRunning(false); es.close(); break
      }
    }
    es.onerror = () => { setErr(`connection lost — is the demo backend running? (${BACKEND})`); setRunning(false); es.close() }
  }

  const latest = right.attempts[right.attempts.length - 1]
  const settled = right.price !== undefined

  return (
    <main className="relative mx-auto max-w-content px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Eyebrow tone="revealed">Live · Stellar testnet</Eyebrow>
          <h1 className="mt-3 text-h2">Frontrunner showdown</h1>
          <p className="mt-3 max-w-xl text-text-dim">
            One bot, two markets — an institutional tUSTB/USDC block trade. On the left the order is visible and gets
            sandwiched. On the right it's a permissioned, timelock-sealed Stelvin batch — the bot fails every read
            until it clears at one fair price near par.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone="live">testnet</Pill>
          <Button size="lg" variant={done ? "ghost" : "primary"} onClick={run} disabled={running}>
            {running ? "running…" : done ? "↻ Run again" : "▶ Run live demo"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {err && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-6 rounded-[var(--radius)] border border-attack/40 bg-attack/10 px-4 py-3 text-sm text-text-dim"
          >
            ⚠ {err}
            <span className="ml-1 text-text-muted">Start it with <code className="text-text">cd settler &amp;&amp; npm run server</code>.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {/* LEFT — transparent AMM */}
        <Panel
          tone="attack"
          title="Transparent DEX"
          badge="Simulated AMM"
          subtitle="Real constant-product mechanics — the order is visible in the mempool."
        >
          {!left && <Empty>Press run. The bot will sandwich a visible block order.</Empty>}
          {left && (
            <>
              <Meta>
                pool {left.rx} tUSTB / {left.ru} USDC · a desk broadcasts a <b className="text-text">visible</b> buy with {left.aliceUSDC} USDC
              </Meta>
              {left.botProfit !== undefined ? (
                <ol className="mt-4 space-y-2.5">
                  <Step n="1" label="bot front-runs" detail={`buys ${left.xBot} tUSTB → price up`} />
                  <Step n="2" label="desk fills worse" detail={`gets ${left.xAlice} tUSTB (fair was ${left.xFair})`} />
                  <Step n="3" label="bot back-runs" detail={`sells ${left.xBot} tUSTB → ${left.usdcBack} USDC`} />
                </ol>
              ) : (
                <Meta className="mt-4 animate-pulse">sandwiching…</Meta>
              )}
              {left.botProfit !== undefined && (
                <ResultBar tone="attack">
                  <span>bot profit <b className="text-attack">+{left.botProfit} USDC</b></span>
                  <span className="text-text-muted">·</span>
                  <span>desk lost <b className="text-text-dim">{left.aliceLoss} tUSTB</b> to the sandwich</span>
                </ResultBar>
              )}
            </>
          )}
        </Panel>

        {/* RIGHT — Stelvin live */}
        <Panel
          tone={settled ? "revealed" : "sealed"}
          title="Stelvin"
          badge="Live · testnet"
          badgeLive
          subtitle="The same bot reads the real on-chain ciphertext and runs tlock decrypt."
        >
          {!right.batchId && <Empty>Press run. The same bot will try to read a sealed order.</Empty>}

          {right.permissioned && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill tone="sealed">Permissioned · KYC</Pill>
              {right.kycReject && (
                <span className="inline-flex items-center gap-1.5 rounded-pill border border-revealed/40 bg-revealed/10 px-3 py-1 font-mono text-xs text-revealed">
                  ✓ un-KYC'd address rejected on-chain
                </span>
              )}
            </div>
          )}

          {right.batchId !== undefined && (
            <Meta>
              batch #{right.batchId} · reveals at drand round <b className="text-text">{right.R}</b> · tUSTB/USDC sealed with tlock
            </Meta>
          )}

          {right.ciphertext && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-border bg-bg/70 p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
                on-chain order · {right.bytes} bytes · opaque
              </div>
              <code className="mt-1.5 block break-all font-mono text-xs text-sealed-300">{right.ciphertext}…</code>
            </div>
          )}

          {/* countdown while sealed */}
          <AnimatePresence>
            {right.attempts.length > 0 && !right.revealed && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-4 flex items-center gap-4 rounded-[var(--radius-sm)] border border-sealed/30 bg-sealed/5 p-4"
              >
                <div className="text-center">
                  <div className="font-mono text-3xl font-semibold text-sealed-300 tabular-nums">{latest?.secondsLeft}s</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">until round R</div>
                </div>
                <div className="flex-1 space-y-1">
                  {right.attempts.slice(-3).map((a) => (
                    <motion.div
                      key={a.n}
                      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between gap-2 font-mono text-xs"
                    >
                      <span className="text-text-muted">🤖 attempt #{a.n}</span>
                      <span className="text-warn">✗ too early</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {right.revealed && !settled && (
            <Meta className="mt-4 text-revealed">round R reached — decrypting &amp; settling on-chain…</Meta>
          )}

          {/* the money moment: reveal burst */}
          <AnimatePresence>
            {settled && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="relative mt-4 overflow-hidden rounded-[var(--radius)] border border-revealed/40 bg-revealed/10 p-5"
              >
                <RevealBurst />
                <div className="relative">
                  <div className="font-mono text-[11px] uppercase tracking-widest text-revealed">settled · uniform price</div>
                  <div className="mt-1 text-h2 font-bold text-revealed">P* = ${right.price}</div>
                  {right.nav !== undefined && (
                    <div className="mt-1 font-mono text-xs text-text-muted">
                      cleared within {right.navDeviationPct}% of NAV (${right.nav?.toFixed(2)} par) — at par, zero MEV
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-dim">
                    <span>alice <b className="text-text">+{right.aliceGainBase} {right.base ?? "tUSTB"}</b></span>
                    <span>bob <b className="text-text">+{right.bobGainUsdc} USDC</b></span>
                    <span>matched <b className="text-text">{right.matched}</b></span>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-pill border border-revealed/40 bg-revealed/10 px-3 py-1 font-mono text-xs text-revealed">
                    frontrun attempts: {right.frontrunAttempts} — 0 successful
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {right.oracle && (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-border bg-surface/40 px-4 py-3 text-sm">
              {right.oracle.unavailable ? (
                <span className="text-text-muted">🔗 Noether oracle reference unavailable (non-blocking)</span>
              ) : (
                <span className="text-text-dim">
                  🔗 <b className="text-text">Noether</b> SEP-40 oracle live{" "}
                  <b className="text-text">${right.oracle.price?.toFixed(4)}</b> ({right.oracle.source}) — composing with Stellar's oracle layer
                </span>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* verdict + verify */}
      <div className="mt-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="rounded-[var(--radius)] border border-border bg-surface/40 p-5 text-sm text-text-dim">
          <b className="text-text">Two layers:</b> timelock hides order contents pre-reveal · uniform-price batch
          clearing removes the ordering edge. MEV isn't promised away — it's cryptographically impossible to react to.
        </div>
        <a
          href={contractUrl(ADDRESSES.batchGate)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-pill border border-border bg-surface/50 px-5 py-3 font-mono text-xs text-text-dim transition-colors hover:border-revealed/50 hover:text-text"
        >
          Verify on stellar.expert · BatchGate {shortAddr(ADDRESSES.batchGate)} ↗
        </a>
      </div>
    </main>
  )
}

/* ─────────────────────── panel sub-components ─────────────────────── */
function Panel({
  tone, title, badge, subtitle, badgeLive, children,
}: {
  tone: "sealed" | "revealed" | "attack"
  title: string; badge: string; subtitle: string; badgeLive?: boolean
  children: ReactNode
}) {
  const ring =
    tone === "revealed" ? "border-revealed/40 shadow-revealed" : tone === "attack" ? "border-attack/30" : "border-sealed/30"
  return (
    <motion.section
      layout
      transition={{ layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
      className={cn("rounded-[var(--radius-lg)] border bg-surface/60 p-6 shadow-card backdrop-blur-sm transition-colors duration-500", ring)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold">{title}</h2>
        {badgeLive ? <Pill tone="live">{badge}</Pill> : <Pill tone={tone === "attack" ? "neutral" : tone}>{badge}</Pill>}
      </div>
      <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>
      <div className="mt-2">{children}</div>
    </motion.section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-6 rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{children}</p>
}
function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-3 text-sm text-text-dim", className)}>{children}</p>
}
function Step({ n, label, detail }: { n: string; label: string; detail: string }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 text-sm"
    >
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-attack/40 font-mono text-[10px] text-attack">{n}</span>
      <span><b className="text-text">{label}</b> <span className="text-text-muted">— {detail}</span></span>
    </motion.li>
  )
}
function ResultBar({ tone, children }: { tone: "attack" | "revealed"; children: ReactNode }) {
  return (
    <div className={cn("mt-5 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border px-4 py-3 text-sm",
      tone === "attack" ? "border-attack/40 bg-attack/10" : "border-revealed/40 bg-revealed/10")}>
      {children}
    </div>
  )
}
function RevealBurst() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.5, scale: 0.6 }}
          animate={{ opacity: 0, scale: 2.2 }}
          transition={{ duration: 1.4, delay: i * 0.3, ease: "easeOut" }}
          className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-revealed/50"
        />
      ))}
    </div>
  )
}
