import { useState } from "react"
import { Button, Pill } from "./primitives"
import { contractUrl, ADDRESSES, LINKS, shortAddr } from "../data/content"
import type { AccountStatus } from "../lib/wallet"

const BACKEND = new URLSearchParams(window.location.search).get("backend") ?? LINKS.demoBackendDefault

// Phase B · slice 1 — read-only wallet connect.
// Connect Freighter and read the connected desk's on-chain KYC status + standing
// balances. No signing yet (that's slice 2: sign & self-submit a sealed order).
// The SDK is loaded lazily on click so the landing bundle stays light.
export function WalletPanel() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle")
  const [address, setAddress] = useState<string | null>(null)
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [kycing, setKycing] = useState(false)

  async function connect() {
    setState("loading"); setErr(null)
    try {
      const w = await import("../lib/wallet")
      const addr = await w.connectFreighter()
      setAddress(addr)
      setStatus(await w.readAccountStatus(addr))
      setState("ok")
    } catch (e) {
      setErr(String((e as Error).message))
      setState("error")
    }
  }

  // Slice 2a — demo desk onboarding: ask the backend (admin) to allowlist this
  // address, then re-read so the gate visibly flips to "✓ KYC allowlisted".
  async function allowlist() {
    if (!address) return
    setKycing(true); setErr(null)
    try {
      const r = await fetch(`${BACKEND}/api/kyc?address=${address}`).then((x) => x.json())
      if (!r.ok) throw new Error(r.error ?? "allowlist failed")
      const w = await import("../lib/wallet")
      setStatus(await w.readAccountStatus(address))
    } catch (e) {
      setErr(`allowlist failed — is the backend running? (${String((e as Error).message)})`)
    } finally {
      setKycing(false)
    }
  }

  return (
    <section className="mt-6 rounded-[var(--radius)] border border-border bg-surface/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
            Connect a desk wallet <span className="text-sealed-300">· Phase B preview</span>
          </div>
          <p className="mt-1 text-sm text-text-dim">
            Check your address's on-chain KYC status &amp; standing balances on the venue.
            <span className="text-text-muted"> Read-only — signing &amp; sealed-order submit is next.</span>
          </p>
        </div>
        <Button onClick={connect} disabled={state === "loading"} variant={state === "ok" ? "ghost" : "primary"}>
          {state === "loading" ? "connecting…" : state === "ok" ? "↻ Refresh" : "Connect Freighter"}
        </Button>
      </div>

      {state === "error" && (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-attack/40 bg-attack/10 px-4 py-3 text-sm text-text-dim">
          ⚠ {err}
        </div>
      )}

      {state === "ok" && address && status && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-sm)] border border-border bg-bg/50 p-3">
            <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">connected</div>
            <a
              href={`${contractUrl(ADDRESSES.batchGate).replace("/contract/", "/account/")}`}
              className="mt-1 block font-mono text-sm text-text"
            >
              {shortAddr(address)}
            </a>
            <div className="mt-2 flex flex-wrap gap-2">
              {status.kyc ? (
                <Pill tone="revealed">✓ KYC allowlisted</Pill>
              ) : (
                <Pill tone="sealed">not allowlisted</Pill>
              )}
              <Pill tone="neutral">{status.permissioned ? "permissioned venue" : "open mode"}</Pill>
            </div>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-border bg-bg/50 p-3">
            <div className="font-mono text-[11px] uppercase tracking-widest text-text-muted">standing balance</div>
            <div className="mt-1.5 flex flex-col gap-1 font-mono text-sm">
              <span className="text-text">{status.tustb.toLocaleString()} <span className="text-text-muted">tUSTB</span></span>
              <span className="text-text">{status.usdc.toLocaleString()} <span className="text-text-muted">USDC</span></span>
            </div>
            {!status.kyc && status.permissioned && (
              <div className="mt-2.5">
                <div className="text-xs text-text-muted">
                  Not allowlisted yet — a permissioned venue admits only KYC'd desks.
                </div>
                <Button onClick={allowlist} disabled={kycing} variant="revealed" className="mt-2">
                  {kycing ? "allowlisting…" : "Allowlist my desk (demo)"}
                </Button>
                <div className="mt-1.5 text-[11px] text-text-muted">
                  Demo only — in production this is the issuer / compliance role, not a public action.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
