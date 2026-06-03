import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent } from "react"
import { animate, motion, useInView, useScroll, useSpring } from "motion/react"
import { cn } from "../lib/cn"

// ── ScrollProgress: a thin sealed→revealed bar pinned to the top, tracking the
//    whole-page scroll. Cheap (compositor-only transform), reads as premium. ──
export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 })
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-sealed via-sealed-300 to-revealed"
    />
  )
}

// ── Counter: counts up to a number when scrolled into view (once). Honors
//    reduced-motion by snapping to the final value. Numbers stay sourced from
//    content.ts — we only animate to the same value. ──
export function Counter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" })
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!inView) return
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value)
      return
    }
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [inView, value])
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}

// ── Reveal: scroll-triggered fade/rise. Honors reduced-motion via Framer's
//    global MotionConfig fallback + the css media query (transition collapses). ──
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as = "div",
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  as?: "div" | "section" | "li" | "span"
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-12% 0px -12% 0px" })
  const MotionTag = motion[as] as typeof motion.div
  return (
    <MotionTag
      ref={ref as never}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  )
}

// ── SpotlightCard: mouse-tracked radial glow on hover (technique from the
//    Noether reference, recolored to Stelvin's sealed/revealed system). ──
export function SpotlightCard({
  children,
  className,
  tone = "sealed",
}: {
  children: ReactNode
  className?: string
  tone?: "sealed" | "revealed" | "attack" | "neutral"
}) {
  const ref = useRef<HTMLDivElement>(null)
  const glow =
    tone === "revealed"
      ? "hsl(80 78% 54% / 0.16)"
      : tone === "attack"
      ? "hsl(9 84% 57% / 0.14)"
      : tone === "neutral"
      ? "hsl(40 20% 80% / 0.08)"
      : "hsl(37 93% 54% / 0.16)"
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = ref.current!.getBoundingClientRect()
    ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`)
    ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`)
  }
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      style={{ ["--glow" as string]: glow } as CSSProperties}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface/70 p-6 shadow-card backdrop-blur-sm",
        "transition-colors duration-300 hover:border-border-soft",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), var(--glow), transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

// ── ShinyText: gradient shimmer sweeping across text (CSS-only variant of the
//    reference technique — cheap, respects reduced-motion). ──
export function ShinyText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("bg-clip-text text-transparent animate-shine-sweep", className)}
      style={{
        backgroundImage:
          "linear-gradient(100deg, hsl(40 8% 50%) 0%, hsl(40 8% 50%) 40%, hsl(42 24% 96%) 50%, hsl(40 8% 50%) 60%, hsl(40 8% 50%) 100%)",
        backgroundSize: "220% auto",
      }}
    >
      {children}
    </span>
  )
}

// ── Section: consistent vertical rhythm + centered content column. ──
export function Section({
  children,
  id,
  className,
}: {
  children: ReactNode
  id?: string
  className?: string
}) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-content px-5 py-20 sm:px-6 sm:py-28", className)}>
      {children}
    </section>
  )
}

export function Eyebrow({ children, tone = "sealed" }: { children: ReactNode; tone?: "sealed" | "revealed" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em]",
        tone === "revealed" ? "text-revealed" : "text-sealed-300",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone === "revealed" ? "bg-revealed" : "bg-sealed")} />
      {children}
    </span>
  )
}

// ── Button / CTA ──
export function Button({
  children,
  onClick,
  href,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  href?: string
  variant?: "primary" | "ghost" | "revealed"
  size?: "md" | "lg"
  className?: string
  disabled?: boolean
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-all duration-200 ease-out focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
  const sizes = size === "lg" ? "px-7 py-3.5 text-base" : "px-5 py-2.5 text-sm"
  const variants = {
    primary:
      "bg-sealed text-bg shadow-[0_8px_30px_-10px_hsl(37_93%_54%/0.7)] hover:bg-sealed-400 hover:shadow-[0_10px_40px_-8px_hsl(37_93%_54%/0.85)] hover:-translate-y-0.5",
    revealed:
      "bg-revealed text-bg shadow-[0_8px_30px_-10px_hsl(80_78%_54%/0.7)] hover:brightness-110 hover:-translate-y-0.5",
    ghost: "border border-border bg-surface/50 text-text hover:border-sealed/60 hover:bg-surface-2",
  }[variant]
  const cls = cn(base, sizes, variants, className)
  if (href) {
    const external = href.startsWith("http")
    return (
      <a className={cls} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {children}
      </a>
    )
  }
  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "sealed" | "revealed" | "neutral" | "live" }) {
  const tones = {
    sealed: "border-sealed/40 text-sealed-300 bg-sealed/10",
    revealed: "border-revealed/40 text-revealed bg-revealed/10",
    neutral: "border-border text-text-dim bg-surface/60",
    live: "border-revealed/50 text-revealed bg-revealed/10",
  }[tone]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 font-mono text-xs", tones)}>
      {tone === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-revealed" />}
      {children}
    </span>
  )
}
