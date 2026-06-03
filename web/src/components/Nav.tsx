import { useEffect, useState } from "react"
import { Logo } from "./Logo"
import { Button } from "./primitives"
import { navigate, type Route } from "../lib/router"
import { LINKS } from "../data/content"
import { cn } from "../lib/cn"

const LANDING_LINKS = [
  { label: "Problem", href: "#problem" },
  { label: "How it works", href: "#how" },
  { label: "Honesty", href: "#honesty" },
  { label: "Ecosystem", href: "#ecosystem" },
]

export function Nav({ route }: { route: Route }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-border/70 bg-bg/80 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex max-w-content items-center justify-between px-5 py-3.5 sm:px-6">
        <Logo onClick={() => navigate("/")} />

        <div className="hidden items-center gap-7 md:flex">
          {route === "/" &&
            LANDING_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-text-dim transition-colors hover:text-text">
                {l.label}
              </a>
            ))}
          <button
            onClick={() => navigate("/demo")}
            className={cn("text-sm transition-colors hover:text-text", route === "/demo" ? "text-text" : "text-text-dim")}
          >
            Demo
          </button>
          <button
            onClick={() => navigate("/docs")}
            className={cn("text-sm transition-colors hover:text-text", route === "/docs" ? "text-text" : "text-text-dim")}
          >
            Docs
          </button>
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="text-sm text-text-dim transition-colors hover:text-text">
            GitHub
          </a>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex">
            <Button size="md" onClick={() => navigate("/demo")}>
              {route === "/demo" ? "↻ Re-run" : "Live demo"}
            </Button>
          </span>
          <button
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-text-dim md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            <span className="text-lg leading-none">{open ? "×" : "≡"}</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-border bg-bg/95 px-5 py-4 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-3">
            {route === "/" &&
              LANDING_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-text-dim">
                  {l.label}
                </a>
              ))}
            <button onClick={() => { navigate("/demo"); setOpen(false) }} className="text-left text-text-dim">
              Demo
            </button>
            <button onClick={() => { navigate("/docs"); setOpen(false) }} className="text-left text-text-dim">
              Docs
            </button>
            <a href={LINKS.github} target="_blank" rel="noreferrer" className="text-text-dim">
              GitHub
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
