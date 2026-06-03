import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Button, Eyebrow, Pill } from "../components/primitives"
import { WalletPanel } from "../components/WalletPanel"
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
  feeQuote?: number; feeBps?: number
  oracle?: Oracle
}
type VerifyResp = {
  ok: boolean
  error?: string
  sigmaMatchesRelay?: boolean
  orders?: { orderId: number; decrypted?: { side: string; amount: number; limit_price: number }; placeholder?: boolean }[]
}

export default function Demo() {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [left, setLeft] = useState<Left | null>(null)
  const [leftStage, setLeftStage] = useState(0) // 0..4 — staged reveal of the LEFT sandwich (kills dead air)
  const [retry, setRetry] = useState<{ R: number; remaining: number } | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [right, setRight] = useState<Right>({ attempts: [] })
  const [secsLeft, setSecsLeft] = useState(0) // smooth per-second countdown to round R
  const [maxSecs, setMaxSecs] = useState(0)
  const [phase, setPhase] = useState<string | null>(null) // current prep step label
  const [verify, setVerify] = useState<VerifyResp | null>(null)
  const [verifying, setVerifying] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const timersRef = useRef<number[]>([])

  async function runVerify() {
    if (right.batchId === undefined) return
    setVerifying(true); setVerify(null)
    try {
      const r = await fetch(`${BACKEND}/api/verify?batch=${right.batchId}`)
      setVerify((await r.json()) as VerifyResp)
    } catch (e) {
      setVerify({ ok: false, error: String((e as Error).message) })
    } finally {
      setVerifying(false)
    }
  }

  // Tick the countdown locally every second so it never looks frozen between
  // the ~3s-apart bot attempts; each attempt re-syncs it to the real value.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setSecsLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [running])

  function run() {
    esRef.current?.close()
    timersRef.current.forEach(clearTimeout); timersRef.current = []
    setRunning(true); setDone(false); setErr(null); setLeft(null); setLeftStage(0)
    setRetry(null); setExhausted(false); setRight({ attempts: [] }); setSecsLeft(0); setMaxSecs(0); setPhase("Connecting to the live demo…"); setVerify(null)
    const es = new EventSource(`${BACKEND}/api/demo`)
    esRef.current = es
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data)
      switch (e.type) {
        case "left_init": setLeft(e); break
        case "left_result":
          setLeft((p) => ({ ...(p as Left), ...e }))
          // Stage the sandwich reveal across the right-side countdown so the
          // comparison stays in motion instead of resolving in ~1s (Kaan).
          ;[1, 2, 3, 4].forEach((stage, i) => {
            timersRef.current.push(window.setTimeout(() => setLeftStage(stage), 1200 + i * 2600))
          })
          break
        case "kyc": setRight((p) => ({ ...p, permissioned: e.permissioned })); break
        case "kyc_reject": setRight((p) => ({ ...p, kycReject: e.blocked })); break
        case "batch_opened": setRetry(null); setSecsLeft(0); setMaxSecs(0); setRight((p) => ({ ...p, batchId: e.batchId, R: e.R, attempts: [], revealed: false })); break
        case "orders_submitted": setRight((p) => ({ ...p, aoid: e.aoid, boid: e.boid, ciphertext: e.ciphertext, bytes: e.bytes })); break
        case "phase": setPhase(e.label); break
        case "bot_attempt":
          setPhase(null)
          setSecsLeft(e.secondsLeft)
          setMaxSecs((m) => Math.max(m, e.secondsLeft))
          setRight((p) => ({ ...p, attempts: [...p.attempts, e as Attempt] }))
          break
        case "feeder_skip": setSecsLeft(0); setMaxSecs(0); setRetry({ R: e.R, remaining: e.remaining }); break
        case "reveal": setRetry(null); setRight((p) => ({ ...p, revealed: true })); break
        case "settled": setRight((p) => ({ ...p, ...e })); break
        case "oracle": setRight((p) => ({ ...p, oracle: e as Oracle })); break
        case "feeder_exhausted": setExhausted(true); break
        case "done": setDone(true); setRunning(false); es.close(); break
        case "error": setErr(e.message); setRunning(false); es.close(); break
      }
    }
    es.onerror = () => {
      // Don't blame our own backend — it may be the network or the live stream ending.
      setErr("Live stream interrupted. A recorded run is in demo/sample-run.txt.")
      setRunning(false); es.close()
    }
  }

  const settled = right.price !== undefined
  const progress = maxSecs > 0 ? Math.min(100, Math.max(0, ((maxSecs - secsLeft) / maxSecs) * 100)) : 0

  return (
    <main className="relative mx-auto max-w-content px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Eyebrow tone="revealed">On-chain demo</Eyebrow>
          <h1 className="mt-3 text-h2">Frontrunner showdown</h1>
          <p className="mt-3 max-w-xl text-text-dim">
            One bot, two markets — an institutional tUSTB/USDC block trade. On the left the order is visible and gets
            sandwiched. On the right it's a permissioned, timelock-sealed Stelvin batch — the bot fails every read
            until it clears at one fair price near par.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="lg" variant={done ? "ghost" : "primary"} onClick={run} disabled={running}>
            {running ? "running…" : done ? "↻ Run again" : "▶ Run demo"}
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
          </motion.div>
        )}
      </AnimatePresence>

      <JourneyStrip />

      <WalletPanel />

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {/* LEFT — transparent AMM */}
        <Panel
          tone="attack"
          title="Transparent DEX"
          badge="Simulated AMM"
          subtitle="Real constant-product mechanics — the order is public on-chain the moment it lands."
        >
          {!left && <Empty>Press run. The bot will sandwich a visible block order.</Empty>}
          {left && (
            <>
              <Meta>
                pool {left.rx} tUSTB / {left.ru} USDC · a desk broadcasts a <b className="text-text">visible</b> buy with {left.aliceUSDC} USDC
              </Meta>
              {left.botProfit !== undefined ? (
                <ol className="mt-4 space-y-2.5">
                  {leftStage >= 1 && <Step n="1" label="bot front-runs" detail={`buys ${left.xBot} tUSTB → price up`} />}
                  {leftStage >= 2 && <Step n="2" label="desk fills worse" detail={`gets ${left.xAlice} tUSTB (fair was ${left.xFair})`} />}
                  {leftStage >= 3 && <Step n="3" label="bot back-runs" detail={`sells ${left.xBot} tUSTB → ${left.usdcBack} USDC`} />}
                  {leftStage < 3 && <Meta className="animate-pulse">sandwiching…</Meta>}
                </ol>
              ) : (
                <Meta className="mt-4 animate-pulse">sandwiching…</Meta>
              )}
              {left.botProfit !== undefined && leftStage >= 4 && (
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
          badge="Sealed batch"
          subtitle="The same bot reads the real on-chain ciphertext and runs tlock decrypt."
        >
          {!running && !right.batchId && !settled && <Empty>Press run. The same bot will try to read a sealed order.</Empty>}

          {/* preparing — fills the on-chain setup wait with real progress */}
          {running && !settled && !right.revealed && right.attempts.length === 0 && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-sealed/30 bg-sealed/5 p-4">
              <div className="flex items-center gap-2 text-sm text-text-dim">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sealed/30 border-t-sealed" />
                {phase ?? "Preparing…"}
              </div>
              <ul className="mt-3 space-y-1.5">
                <PrepStep label="Permissioned venue configured (KYC + fee)" done={right.permissioned !== undefined} />
                <PrepStep label="Sealed batch opened on-chain" done={right.batchId !== undefined} />
                <PrepStep label="Sealed orders submitted" done={Boolean(right.ciphertext)} />
                <PrepStep label="Waiting for drand round R" done={false} />
              </ul>
              <div className="mt-2 text-[11px] text-text-muted">Each step is a real on-chain transaction — a few seconds each.</div>
            </div>
          )}

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

          {/* countdown while sealed — ticks every second so it never looks frozen */}
          <AnimatePresence>
            {right.attempts.length > 0 && !right.revealed && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-4 rounded-[var(--radius-sm)] border border-sealed/30 bg-sealed/5 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="font-mono text-3xl font-semibold text-sealed-300 tabular-nums">{secsLeft}s</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">until round R</div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
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
                </div>
                {/* progress to R */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sealed/15">
                  <div
                    className="h-full rounded-full bg-sealed transition-[width] duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sealed" />
                  sealed — the bot can't read the order; everyone waits for the beacon
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* feeder skip — amber, demo-safe; never blames the venue */}
          <AnimatePresence>
            {retry && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-4 rounded-[var(--radius-sm)] border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-text-dim"
              >
                ⏳ drand <b className="text-warn">beacon skipped round {retry.R}</b> — auto-retrying with a fresh sealed batch
                {retry.remaining > 0 ? ` (${retry.remaining} left)` : ""}.{" "}
                <span className="text-text-muted">That's the public beacon, not the venue.</span>
              </motion.div>
            )}
          </AnimatePresence>

          {exhausted && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-text-dim">
              ⏳ the drand feeder skipped several rounds — a recorded run is in{" "}
              <code className="text-text">demo/sample-run.txt</code>.
            </div>
          )}

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
                  {right.navDeviationPct !== undefined && (
                    <div
                      className={cn(
                        "mt-2 inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 font-mono text-[11px]",
                        right.navDeviationPct <= 1
                          ? "border-revealed/40 bg-revealed/10 text-revealed"
                          : "border-warn/40 bg-warn/10 text-warn",
                      )}
                    >
                      {right.navDeviationPct <= 1 ? "✓" : "⚠"} fair-value guardrail · {right.navDeviationPct}% vs reference
                      <span className="text-text-muted"> · display-only (on-chain: roadmap)</span>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-dim">
                    <span>alice <b className="text-text">+{right.aliceGainBase} {right.base ?? "tUSTB"}</b></span>
                    <span>bob <b className="text-text">+{right.bobGainUsdc} USDC</b></span>
                    <span>matched <b className="text-text">{right.matched}</b></span>
                  </div>
                  {right.feeQuote !== undefined && (
                    <div className="mt-3 rounded-[var(--radius-sm)] border border-border bg-bg/50 px-3 py-2 text-xs">
                      <div className="text-text-dim">
                        💰 venue fee <b className="text-text">{right.feeQuote} USDC</b>
                        <span className="text-text-muted"> ({right.feeBps} bps)</span> → protocol revenue
                        <span className="text-revealed"> · real, on-chain</span>
                      </div>
                      <div className="mt-1 text-text-muted">
                        + surplus capture (50% of price-improvement vs a transparent venue) — roadmap, reference-priced
                      </div>
                    </div>
                  )}
                  <div className="mt-3 inline-flex items-center gap-2 rounded-pill border border-revealed/40 bg-revealed/10 px-3 py-1 font-mono text-xs text-revealed">
                    frontrun attempts: {right.frontrunAttempts} — 0 successful
                  </div>

                  {/* Public auditor — re-decrypt from the public beacon, no trust. */}
                  <div className="mt-4 border-t border-revealed/20 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="max-w-md text-xs text-text-muted">
                        Don't trust the settler — <b className="text-text-dim">verify</b>. Anyone can re-decrypt every
                        order from the public beacon σ_R (no admin keys, no settler trust).
                      </div>
                      <Button size="md" variant="ghost" onClick={runVerify} disabled={verifying}>
                        {verifying ? "verifying…" : "🔓 Verify independently"}
                      </Button>
                    </div>
                    {verify && <VerifyResult v={verify} />}
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

/* ─────────────────────── venue user journey ─────────────────────── */
function JourneyStrip() {
  const steps = [
    { n: "1", label: "Get KYC'd", note: "allowlisted desk" },
    { n: "2", label: "Deposit", note: "USDC / tUSTB" },
    { n: "3", label: "Sealed order", note: "timelock to round R" },
    { n: "4", label: "Clear at NAV", note: "one uniform price" },
    { n: "5", label: "Withdraw", note: "realized balance" },
  ]
  return (
    <div className="mt-6 rounded-[var(--radius)] border border-border bg-surface/40 p-4">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-widest text-text-muted">
        How a desk uses the venue
      </div>
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {steps.map((s, i) => (
          <li key={s.n} className="flex flex-1 items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-sealed/40 bg-sealed/10 font-mono text-xs text-sealed-300">
              {s.n}
            </span>
            <div className="leading-tight">
              <div className="text-sm font-medium text-text">{s.label}</div>
              <div className="text-xs text-text-muted">{s.note}</div>
            </div>
            {i < steps.length - 1 && <span className="ml-auto hidden text-text-muted sm:block">→</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ─────────────────────── panel sub-components ─────────────────────── */
function Panel({
  tone, title, badge, subtitle, children,
}: {
  tone: "sealed" | "revealed" | "attack"
  title: string; badge: string; subtitle: string
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
        <Pill tone={tone === "attack" ? "neutral" : tone}>{badge}</Pill>
      </div>
      <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>
      <div className="mt-2">{children}</div>
    </motion.section>
  )
}

function PrepStep({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className={done ? "text-revealed" : "text-text-muted"}>{done ? "✓" : "○"}</span>
      <span className={done ? "text-text-dim" : "text-text-muted"}>{label}</span>
    </li>
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

function VerifyResult({ v }: { v: VerifyResp }) {
  if (!v.ok) return <p className="mt-3 font-mono text-xs text-warn">⚠ {v.error}</p>
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-[var(--radius-sm)] border border-revealed/30 bg-bg/60 p-3 font-mono text-xs"
    >
      <div className={v.sigmaMatchesRelay ? "text-revealed" : "text-attack"}>
        {v.sigmaMatchesRelay ? "✓" : "✗"} sha256(public σ_R) == relay.get(R) — the exact key the contract verified
      </div>
      <div className="mt-2 space-y-1">
        {v.orders?.map((o) => (
          <div key={o.orderId} className="text-text-dim">
            order {o.orderId}:{" "}
            {o.placeholder ? (
              <span className="text-text-muted">(placeholder ciphertext — nothing to decrypt)</span>
            ) : (
              <span className="text-text">
                {o.decrypted?.side} {o.decrypted?.amount} @ ${(Number(o.decrypted?.limit_price) / 1e7).toFixed(3)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 text-text-muted">
        Recomputed from the public beacon — a misreported or censored order would show up here.
      </div>
    </motion.div>
  )
}
