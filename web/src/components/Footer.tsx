import { Logo } from "./Logo"
import { navigate } from "../lib/router"
import { LINKS } from "../data/content"

export function Footer() {
  return (
    <footer className="relative border-t border-border/70 bg-bg-soft/60">
      <div className="mx-auto flex max-w-content flex-col gap-8 px-5 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo onClick={() => navigate("/")} />
          <p className="mt-3 text-sm text-text-muted">
            Fair markets, by construction. A sealed-bid batch DEX on Stellar Soroban —
            timelock-sealed orders, one on-chain uniform price.
          </p>
          <p className="mt-4 font-mono text-xs text-text-muted">Build on Stellar · IBW 2026 · Main + Privacy</p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:gap-14">
          <div className="flex flex-col gap-2.5 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-text-muted">Product</span>
            <button onClick={() => navigate("/demo")} className="text-left text-text-dim hover:text-text">Live demo</button>
            <a href="#how" onClick={() => navigate("/")} className="text-text-dim hover:text-text">How it works</a>
            <a href="#honesty" onClick={() => navigate("/")} className="text-text-dim hover:text-text">What we hide</a>
          </div>
          <div className="flex flex-col gap-2.5 text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-text-muted">Verify</span>
            <a href={LINKS.github} target="_blank" rel="noreferrer" className="text-text-dim hover:text-text">GitHub</a>
            <a href={LINKS.explorer} target="_blank" rel="noreferrer" className="text-text-dim hover:text-text">stellar.expert</a>
            <span className="text-text-muted">MIT licensed</span>
          </div>
        </div>
      </div>
      <div className="border-t border-border/50 py-5 text-center font-mono text-xs text-text-muted">
        MEV isn't promised away — it's cryptographically impossible to react to.
      </div>
    </footer>
  )
}
