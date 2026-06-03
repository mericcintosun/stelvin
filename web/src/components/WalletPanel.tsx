import { useState } from "react"
import { Button, Pill } from "./primitives"
import { contractUrl, ADDRESSES, LINKS, RWA, shortAddr } from "../data/content"
import type { AccountStatus, SealOrder } from "../lib/wallet"

const BACKEND = new URLSearchParams(window.location.search).get("backend") ?? LINKS.demoBackendDefault

// Phase B — connect Freighter, read on-chain KYC + standing balances (slice 1),
// then SIGN & SELF-SUBMIT real transactions (slice 2): get test tokens, deposit,
// and submit a timelock-sealed order from the desk's own wallet. The SDK +
// tlock-js are loaded lazily on demand so the landing bundle stays light.
export function WalletPanel() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle")
  const [address, setAddress] = useState<string | null>(null)
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [kycing, setKycing] = useState(false)

  // slice-2 action state
  const [busy, setBusy] = useState<string | null>(null) // which action is running
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [depAsset, setDepAsset] = useState<"usdc" | "tustb">("usdc")
  const [depAmount, setDepAmount] = useState("500000")
  const [side, setSide] = useState<"Buy" | "Sell">("Buy")
  const [ordAmount, setOrdAmount] = useState("10000")
  const [ordPrice, setOrdPrice] = useState("1.000")

  async function refresh(addr = address) {
    if (!addr) return
    const w = await import("../lib/wallet")
    setStatus(await w.readAccountStatus(addr))
  }

  async function connect() {
    setState("loading"); setErr(null)
    try {
      const w = await import("../lib/wallet")
      const addr = await w.connectFreighter()
      setAddress(addr)
      setStatus(await w.readAccountStatus(addr))
      setState("ok")
    } catch (e) {
      setErr(String((e as Error).message)); setState("error")
    }
  }

  async function allowlist() {
    if (!address) return
    setKycing(true); setErr(null)
    try {
      const r = await fetch(`${BACKEND}/api/kyc?address=${address}`).then((x) => x.json())
      if (!r.ok) throw new Error(r.error ?? "allowlist failed")
      await refresh()
    } catch (e) {
      setErr(`allowlist failed — is the backend running? (${String((e as Error).message)})`)
    } finally {
      setKycing(false)
    }
  }

  // wrap a signed action with shared busy/notice handling
  async function act(label: string, fn: () => Promise<string | void>) {
    setBusy(label); setNote(null)
    try {
      const hash = await fn()
      setNote({ kind: "ok", text: hash ? `${label} ✓ — tx ${String(hash).slice(0, 8)}…` : `${label} ✓` })
      await refresh()
    } catch (e) {
      setNote({ kind: "err", text: `${label} failed: ${String((e as Error).message).slice(0, 120)}` })
    } finally {
      setBusy(null)
    }
  }

  async function getTokens() {
    if (!address) return
    await act("Get test tokens", async () => {
      const w = await import("../lib/wallet")
      await w.establishTrustlines(address) // desk signs trustlines
      const r = await fetch(`${BACKEND}/api/faucet?address=${address}`).then((x) => x.json())
      if (!r.ok) throw new Error(r.error ?? "faucet failed")
    })
  }

  async function doDeposit() {
    if (!address) return
    const sac = depAsset === "usdc" ? ADDRESSES.usdcSac : ADDRESSES.tustbSac
    const amt = Math.floor(Number(depAmount))
    if (!(amt > 0)) return setNote({ kind: "err", text: "enter a positive amount" })
    await act("Deposit", async () => (await import("../lib/wallet")).deposit(address, sac, amt))
  }

  async function doSubmit() {
    if (!address) return
    const amt = Math.floor(Number(ordAmount))
    const price = Math.round(Number(ordPrice) * 1e7)
    if (!(amt > 0) || !(price > 0)) return setNote({ kind: "err", text: "enter a positive amount and price" })
    await act("Submit sealed order", async () => {
      const w = await import("../lib/wallet")
      const b = await fetch(`${BACKEND}/api/open-batch`).then((x) => x.json())
      if (!b.ok) throw new Error(b.error ?? "could not open a batch")
      const order: SealOrder = { side, amount: amt, limit_price: price }
      const hash = await w.submitSealedOrder(address, b.batchId, b.R, order)
      setNote({ kind: "ok", text: `Sealed order #? submitted to batch ${b.batchId}, reveals at round ${b.R} — tx ${hash.slice(0, 8)}…` })
      return hash
    })
  }

  const canAct = state === "ok" && address && status

  return (
    <section className="mt-6 rounded-[var(--radius)] border border-border bg-surface/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
            Connect a desk wallet <span className="text-revealed">· Phase B · sign &amp; submit</span>
          </div>
          <p className="mt-1 text-sm text-text-dim">
            Check your KYC status &amp; balances, then <span className="text-text">deposit and submit a sealed order</span>{" "}
            from your own wallet — real on-chain, signed in Freighter.
          </p>
        </div>
        <Button onClick={connect} disabled={state === "loading"} variant={state === "ok" ? "ghost" : "primary"}>
          {state === "loading" ? "connecting…" : state === "ok" ? "↻ Refresh" : "Connect Freighter"}
        </Button>
      </div>

      {state === "error" && (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-attack/40 bg-attack/10 px-4 py-3 text-sm text-text-dim">⚠ {err}</div>
      )}

      {canAct && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-sm)] border border-border bg-bg/50 p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">connected</div>
              <div className="mt-1 font-mono text-sm text-text">{shortAddr(address!)}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {status!.kyc ? <Pill tone="revealed">✓ KYC allowlisted</Pill> : <Pill tone="sealed">not allowlisted</Pill>}
                <Pill tone="neutral">{status!.permissioned ? "permissioned venue" : "open mode"}</Pill>
              </div>
              {!status!.kyc && status!.permissioned && (
                <div className="mt-2.5">
                  <Button onClick={allowlist} disabled={kycing} variant="revealed" className="mt-1">
                    {kycing ? "allowlisting…" : "Allowlist my desk (demo)"}
                  </Button>
                  <div className="mt-1.5 text-[11px] text-text-muted">Demo only — in production this is the issuer / compliance role.</div>
                </div>
              )}
            </div>
            <div className="rounded-[var(--radius-sm)] border border-border bg-bg/50 p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">standing balance</div>
              <div className="mt-1.5 flex flex-col gap-1 font-mono text-sm">
                <span className="text-text">{status!.tustb.toLocaleString()} <span className="text-text-muted">tUSTB</span></span>
                <span className="text-text">{status!.usdc.toLocaleString()} <span className="text-text-muted">USDC</span></span>
              </div>
              <Button onClick={getTokens} disabled={busy !== null} variant="ghost" className="mt-3">
                {busy === "Get test tokens" ? "minting…" : "Get test tokens (demo)"}
              </Button>
              <div className="mt-1.5 text-[11px] text-text-muted">Signs trustlines, then the issuer mints test tUSTB + USDC to your wallet.</div>
            </div>
          </div>

          {/* slice 2 — real signed actions */}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {/* deposit */}
            <div className="rounded-[var(--radius-sm)] border border-border bg-bg/50 p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">deposit to standing balance</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-pill border border-border text-xs">
                  {(["usdc", "tustb"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setDepAsset(a)}
                      className={"px-3 py-1.5 font-mono " + (depAsset === a ? "bg-sealed/20 text-sealed-300" : "text-text-muted")}
                    >
                      {a === "usdc" ? "USDC" : "tUSTB"}
                    </button>
                  ))}
                </div>
                <input
                  value={depAmount}
                  onChange={(e) => setDepAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  className="w-28 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text outline-none focus:border-sealed/60"
                />
                <Button onClick={doDeposit} disabled={busy !== null}>
                  {busy === "Deposit" ? "depositing…" : "Deposit"}
                </Button>
              </div>
              <div className="mt-1.5 text-[11px] text-text-muted">Pulls the SAC token into the venue (you sign in Freighter). New wallet? Click <b className="text-text-dim">Get test tokens</b> first.</div>
            </div>

            {/* sealed order */}
            <div className="rounded-[var(--radius-sm)] border border-sealed/30 bg-sealed/5 p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-sealed-300">submit a sealed order</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-pill border border-border text-xs">
                  {(["Buy", "Sell"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={"px-3 py-1.5 font-mono " + (side === s ? "bg-revealed/20 text-revealed" : "text-text-muted")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <input
                  value={ordAmount}
                  onChange={(e) => setOrdAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  placeholder="amount"
                  className="w-24 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text outline-none focus:border-sealed/60"
                />
                <span className="font-mono text-xs text-text-muted">@</span>
                <input
                  value={ordPrice}
                  onChange={(e) => setOrdPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  placeholder="price"
                  className="w-20 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-1.5 font-mono text-sm text-text outline-none focus:border-sealed/60"
                />
                <Button onClick={doSubmit} disabled={busy !== null} variant="revealed">
                  {busy === "Submit sealed order" ? "sealing…" : "Seal & submit"}
                </Button>
              </div>
              <div className="mt-1.5 text-[11px] text-text-muted">
                tlock-encrypted to a future drand round in your browser — unreadable by anyone until R. Needs a funded
                balance{status!.permissioned ? " + KYC" : ""}.
              </div>
            </div>
          </div>

          {note && (
            <div
              className={
                "mt-3 rounded-[var(--radius-sm)] border px-4 py-2.5 text-sm " +
                (note.kind === "ok"
                  ? "border-revealed/40 bg-revealed/10 text-text-dim"
                  : "border-attack/40 bg-attack/10 text-text-dim")
              }
            >
              {note.kind === "ok" ? "✓ " : "⚠ "}
              {note.text}
            </div>
          )}
        </>
      )}

      <div className="mt-3 text-right">
        <a
          href={contractUrl(ADDRESSES.batchGate)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-text-muted transition-colors hover:text-text"
        >
          BatchGate {shortAddr(ADDRESSES.batchGate)} ↗
        </a>
      </div>
    </section>
  )
}
