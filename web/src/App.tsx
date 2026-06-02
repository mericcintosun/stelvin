import { useRef, useState } from "react"

const BACKEND = "http://localhost:8787"
const GATE = "CBANDFRY6BXQRGRUXIJB6VUZHVH6E4JZIVWBY6JURFRHPWJQ7WT5UOFA"

type Left = {
  rx: number; ru: number; aliceUSDC: number; botUSDC: number
  xFair?: number; xBot?: number; xAlice?: number; usdcBack?: number; botProfit?: number; aliceLoss?: number
}
type Attempt = { n: number; message: string; secondsLeft: number }
type Oracle = { price?: number; source?: string; stale?: boolean; deviationPct?: number; unavailable?: boolean }
type Right = {
  batchId?: number; R?: number; aoid?: number; boid?: number; ciphertext?: string; bytes?: number
  attempts: Attempt[]; revealed?: boolean
  price?: number; matched?: number; aliceGainX?: number; bobGainUsdc?: number; frontrunAttempts?: number
  oracle?: Oracle
}

export default function App() {
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
    es.onerror = () => { setErr("connection lost — is the backend running on :8787?"); setRunning(false); es.close() }
  }

  const latest = right.attempts[right.attempts.length - 1]

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Stelvin <span className="sub">frontrunner showdown</span></h1>
          <p className="tag">One bot, two markets. Orders are timelock-encrypted and unreadable —
            by anyone — until they clear at one uniform price. <b>MEV: cryptographically impossible to react to.</b></p>
        </div>
        <button onClick={run} disabled={running}>{running ? "running…" : done ? "run again" : "▶ run live demo"}</button>
      </header>

      {err && <div className="err">⚠ {err}</div>}

      <div className="grid">
        {/* LEFT — transparent DEX */}
        <section className="panel red">
          <h2>Transparent DEX <span className="badge">SIMULATED AMM</span></h2>
          {!left && <p className="muted">Press run. The bot will sandwich a visible order.</p>}
          {left && (
            <>
              <p className="muted">pool {left.rx} X / {left.ru} USDC · alice broadcasts a <b>visible</b> buy with {left.aliceUSDC} USDC</p>
              {left.botProfit !== undefined ? (
                <ul className="steps">
                  <li>🤖 bot front-runs: buys {left.xBot} X → price up</li>
                  <li>alice fills at the <b>worse</b> price: {left.xAlice} X <span className="muted">(fair {left.xFair})</span></li>
                  <li>🤖 bot back-runs: sells {left.xBot} X → {left.usdcBack} USDC</li>
                </ul>
              ) : <p className="muted">sandwiching…</p>}
              {left.botProfit !== undefined && (
                <div className="result bad">
                  ✗ bot profit <b>+{left.botProfit} USDC</b> · alice lost <b>{left.aliceLoss} X</b> to the sandwich
                </div>
              )}
            </>
          )}
        </section>

        {/* RIGHT — Stelvin live */}
        <section className="panel green">
          <h2>Stelvin <span className="badge live">LIVE · testnet</span></h2>
          {!right.batchId && <p className="muted">Press run. The same bot will try to read a sealed order.</p>}
          {right.batchId !== undefined && (
            <p className="muted">batch #{right.batchId} · reveals at drand round <b>{right.R}</b> · orders sealed with tlock</p>
          )}
          {right.ciphertext && (
            <div className="cipher">
              <span className="muted">on-chain order ({right.bytes} bytes, opaque):</span>
              <code>{right.ciphertext}…</code>
            </div>
          )}
          {right.attempts.length > 0 && !right.revealed && (
            <div className="countdown">
              <div className="big">{latest?.secondsLeft}s</div>
              <div className="muted">until round R</div>
            </div>
          )}
          {right.attempts.length > 0 && (
            <ul className="attempts">
              {right.attempts.map((a) => (
                <li key={a.n}>🤖 attempt #{a.n}: tlock decrypt → <span className="warn">too early</span></li>
              ))}
            </ul>
          )}
          {right.revealed && right.price === undefined && <p className="muted">round R reached — settling on-chain…</p>}
          {right.price !== undefined && (
            <div className="result good">
              ✓ settled at uniform price <b>P* = {right.price} XLM/USDC</b> · alice <b>+{right.aliceGainX} XLM</b> · bob <b>+{right.bobGainUsdc} USDC</b>
              <div className="zero">frontrun attempts: {right.frontrunAttempts} — <b>0 successful</b></div>
            </div>
          )}
          {right.oracle && (
            <div className="oracle">
              {right.oracle.unavailable
                ? <span className="muted">Noether oracle reference unavailable (non-blocking)</span>
                : <>🔗 <b>Noether</b> SEP-40 oracle fair value <b>${right.oracle.price?.toFixed(4)}</b> ({right.oracle.source}) · Stelvin cleared within <b>{right.oracle.deviationPct}%</b> → fair</>}
            </div>
          )}
        </section>
      </div>

      <footer>
        <span><b>Two layers:</b> timelock hides order contents pre-reveal · uniform-price batch clearing removes ordering edge.</span>
        <span className="muted">Live on Stellar testnet · BatchGate <code>{GATE.slice(0, 6)}…{GATE.slice(-4)}</code> · Main + Privacy tracks</span>
      </footer>
    </div>
  )
}
