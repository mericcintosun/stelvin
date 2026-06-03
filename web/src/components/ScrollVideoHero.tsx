// ScrollVideoHero — Apple-style scroll-scrubbed canvas image-sequence hero.
//
// The source clip (input.mp4) is a vault scene whose glowing ring goes
// gold → green → gold, mirroring Stelvin's own state machine:
// SEALED (amber) → REVEALED/cleared at round R (lime) → settled. We decode it
// to a JPEG frame sequence and draw the frame that matches scroll progress onto
// a <canvas>, so scrubbing is buttery in BOTH directions (unlike <video>.currentTime).
//
// The three HERO.tagline beats ("Sealed orders." → "One fair price." →
// "Zero front-running.") cross-fade in sync with the three visual phases.
//
// Accessibility / perf: prefers-reduced-motion and small/touch screens get a
// static poster hero (no pin, no scroll-jacking, no 150-frame decode).

import { forwardRef, useRef, useState, type ReactNode } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { Button, Pill } from "./primitives"
import { navigate } from "../lib/router"
import { CRYPTO, HERO } from "../data/content"

gsap.registerPlugin(useGSAP, ScrollTrigger)

const FRAME_COUNT = 150
const framePath = (i: number) => `/frames/frame_${String(i + 1).padStart(4, "0")}.jpg`

/** Detect once: reduced-motion or a small/touch screen → static fallback. */
function prefersStatic(): boolean {
  if (typeof window === "undefined") return true
  const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const small = window.matchMedia("(max-width: 767px)").matches
  return rm || small
}

export default function ScrollVideoHero() {
  const [isStatic] = useState(prefersStatic)
  const [pct, setPct] = useState(0)
  const [ready, setReady] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const beat0 = useRef<HTMLDivElement>(null)
  const beat1 = useRef<HTMLDivElement>(null)
  const beat2 = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (isStatic) return
      const canvas = canvasRef.current
      const pin = pinRef.current
      if (!canvas || !pin) return
      const c2d = canvas.getContext("2d")
      if (!c2d) return

      const images: HTMLImageElement[] = []
      const state = { frame: 0 }
      let cancelled = false

      // object-cover draw: fill the canvas, preserve aspect, DPR-aware (capped at
      // 2 so retina doesn't blow the backing store for a 1280px source).
      const render = () => {
        const i = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)))
        const img = images[i]
        if (!img || !img.complete || !img.naturalWidth) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const cw = canvas.clientWidth
        const ch = canvas.clientHeight
        if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
          canvas.width = Math.round(cw * dpr)
          canvas.height = Math.round(ch * dpr)
        }
        const s = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
        const w = img.naturalWidth * s
        const h = img.naturalHeight * s
        c2d.imageSmoothingEnabled = true // best resample of the 720p source on big screens
        c2d.imageSmoothingQuality = "high"
        c2d.clearRect(0, 0, canvas.width, canvas.height)
        c2d.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
      }

      // Build the scrubbed timeline SYNCHRONOUSLY so useGSAP's context tracks and
      // reverts it cleanly — no leaked/duplicate pins under StrictMode + HMR.
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: pin,
          start: "top top",
          end: "+=240%", // ~2.4 screens — snappy, reaches the Problem section fast
          scrub: 1, // soft 1s catch-up — far less jitter than `true`
          pin,
          pinSpacing: true,
          invalidateOnRefresh: true,
        },
      })
      tl.to(state, { frame: FRAME_COUNT - 1, duration: 1, onUpdate: render }, 0)

      // Three tagline beats cross-faded against the gold→green→gold phases.
      gsap.set(beat0.current, { opacity: 1, y: 0 })
      gsap.set([beat1.current, beat2.current], { opacity: 0, y: 28 })
      tl.to(cueRef.current, { opacity: 0, duration: 0.05 }, 0.03)
      tl.to(beat0.current, { opacity: 0, y: -28, duration: 0.1 }, 0.24)
      tl.to(beat1.current, { opacity: 1, y: 0, duration: 0.1 }, 0.36)
      tl.to(beat1.current, { opacity: 0, y: -28, duration: 0.1 }, 0.58)
      tl.to(beat2.current, { opacity: 1, y: 0, duration: 0.12 }, 0.68)

      // Preload frames (no GSAP creation here → cleanup-safe). Paint frame 0 ASAP,
      // enable the hero once all decode, then refresh the pin geometry.
      let loaded = 0
      for (let i = 0; i < FRAME_COUNT; i++) {
        const img = new Image()
        img.src = framePath(i)
        img.onload = img.onerror = () => {
          if (cancelled) return
          loaded++
          setPct(Math.round((loaded / FRAME_COUNT) * 100))
          if (loaded === 1) render()
          if (loaded === FRAME_COUNT) {
            setReady(true)
            render()
            ScrollTrigger.refresh()
          }
        }
        images[i] = img
      }

      const onResize = () => render()
      window.addEventListener("resize", onResize)
      return () => {
        cancelled = true
        window.removeEventListener("resize", onResize)
      }
    },
    { scope: rootRef, dependencies: [isStatic] },
  )

  if (isStatic) return <StaticHero />

  return (
    <section ref={rootRef} className="relative">
      <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          className={
            "absolute inset-0 h-full w-full transition-[opacity,transform] duration-700 ease-out " +
            (ready ? "scale-100 opacity-100" : "scale-[1.05] opacity-0")
          }
        />

        {/* Cinematic scrims. The ring stays bright in the upper-center; the lower
            third (where the copy lives) is darkened, with an edge vignette and a
            bottom fade into the next section. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(92% 62% at 50% 84%, hsl(var(--bg) / 0.86) 0%, hsl(var(--bg) / 0.35) 46%, transparent 72%)," +
              "radial-gradient(135% 100% at 50% 32%, transparent 40%, hsl(var(--bg) / 0.62) 100%)," +
              "linear-gradient(to bottom, hsl(var(--bg) / 0.55) 0%, transparent 26%, transparent 40%, hsl(var(--bg) / 0.96) 94%)",
          }}
        />

        {/* Film grain — masks 720p softness + gradient banding, reads as cinematic. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-soft-light"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "160px 160px",
          }}
        />

        {/* Copy in the lower third so the ring breathes in the upper-center. */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-5 pb-[12vh] text-center">
          <div
            className="relative min-h-[15rem] w-full max-w-3xl"
            style={{ textShadow: "0 1px 2px hsl(var(--bg) / 0.7), 0 2px 30px hsl(var(--bg) / 0.85)" }}
          >
            <Beat ref={beat0}>
              <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
                <Pill tone="sealed">Tokenized RWA · Stellar</Pill>
                <Pill tone="neutral">Main + Privacy</Pill>
              </div>
              <h1 className="text-display font-bold">{HERO.tagline[0]}</h1>
              <p className="mx-auto mt-5 max-w-lg text-lg text-text-dim">
                Every block order is timelock-encrypted — unreadable by anyone, the operator and settler included.
              </p>
            </Beat>

            <Beat ref={beat1}>
              <h1 className="text-display font-bold">
                <span className="text-revealed-gradient">{HERO.tagline[1]}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-lg text-text-dim">
                At drand round R the whole batch clears at a single uniform price — computed on-chain by the contract,
                not the settler.
              </p>
            </Beat>

            <Beat ref={beat2}>
              <h1 className="text-display font-bold">
                <span className="text-brand-gradient">{HERO.tagline[2]}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base text-text-dim">
                A sealed-bid batch DEX on Stellar. MEV isn't promised away — it's cryptographically impossible to react to.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" onClick={() => navigate("/demo")}>
                  {HERO.cta} <span aria-hidden>→</span>
                </Button>
                <Button size="lg" variant="ghost" href="#problem">
                  How it works
                </Button>
              </div>
              <p className="mt-7 font-mono text-xs text-text-muted">
                ~90s end-to-end · {CRYPTO.beacon} · {CRYPTO.scheme}
              </p>
            </Beat>
          </div>
        </div>

        {/* Scroll cue (fades out as the sequence starts). */}
        <div
          ref={cueRef}
          className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-text-muted"
        >
          <span>scroll to reveal</span>
          <span className="h-7 w-px animate-pulse bg-gradient-to-b from-sealed/70 to-transparent" />
        </div>

        {/* Loader (until all frames are decoded). */}
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-bg/70 backdrop-blur-sm">
            <div className="flex w-56 flex-col items-center gap-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-muted">loading sequence</div>
              <div className="h-px w-full overflow-hidden bg-border">
                <div
                  className="h-full bg-gradient-to-r from-sealed to-revealed transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="font-mono text-xs text-text-dim">{pct}%</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* Beat wrapper — absolutely stacked so the three messages occupy the same spot. */
const Beat = forwardRef<HTMLDivElement, { children: ReactNode }>(function Beat({ children }, ref) {
  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0">
      {children}
    </div>
  )
})

/* Static fallback: poster image + the full message, no pin / no scrub. */
function StaticHero() {
  return (
    <section className="relative min-h-[88vh] overflow-hidden">
      <img src="/poster.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-70" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, hsl(var(--bg) / 0.5) 0%, transparent 30%, hsl(var(--bg) / 0.9) 100%)",
        }}
      />
      <div className="relative mx-auto grid min-h-[88vh] max-w-content place-items-center px-5 text-center">
        <div className="max-w-2xl">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
            <Pill tone="sealed">Tokenized RWA · Stellar</Pill>
            <Pill tone="neutral">Main + Privacy</Pill>
          </div>
          <h1 className="text-display font-bold">
            {HERO.tagline[0]} {HERO.tagline[1]} <span className="text-brand-gradient">{HERO.tagline[2]}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-text-dim">{HERO.sub}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/demo")}>
              {HERO.cta} <span aria-hidden>→</span>
            </Button>
            <Button size="lg" variant="ghost" href="#problem">
              How it works
            </Button>
          </div>
          <p className="mt-7 font-mono text-xs text-text-muted">
            ~90s end-to-end · {CRYPTO.beacon} · {CRYPTO.scheme}
          </p>
        </div>
      </div>
    </section>
  )
}
