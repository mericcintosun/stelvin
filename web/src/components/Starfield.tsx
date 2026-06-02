import { useEffect, useRef } from "react"

// Lightweight procedural starfield on <canvas> — no Three.js.
// Two parallax layers + gentle twinkle. Caps DPR, halves density on small
// screens, and fully freezes (single static frame) for prefers-reduced-motion.
// Fixed, behind everything, pointer-events: none.
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const c = cv.getContext("2d", { alpha: true })
    if (!c) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const small = window.matchMedia("(max-width: 640px)").matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    type Star = { x: number; y: number; z: number; r: number; tw: number; ph: number; hue: number }
    let stars: Star[] = []
    let w = 0
    let h = 0
    let raf = 0
    let baseY: number[] = []
    let t = 0
    let scrollY = window.scrollY

    const rng = (a: number, b: number) => a + Math.random() * (b - a)

    function build() {
      w = cv!.clientWidth
      h = cv!.clientHeight
      cv!.width = Math.floor(w * dpr)
      cv!.height = Math.floor(h * dpr)
      c!.setTransform(dpr, 0, 0, dpr, 0, 0)
      const density = (small ? 0.00012 : 0.00018) * w * h
      const count = Math.max(40, Math.min(260, Math.floor(density)))
      stars = Array.from({ length: count }, () => {
        const z = rng(0.2, 1) // depth → parallax + size + brightness
        return {
          x: rng(0, w),
          y: rng(0, h),
          z,
          r: z * rng(0.5, 1.5),
          tw: rng(0.004, 0.02),
          ph: rng(0, Math.PI * 2),
          hue: Math.random() < 0.14 ? (Math.random() < 0.5 ? 40 : 80) : 44, // mostly warm white, a few amber/lime
        }
      })
      baseY = stars.map((s) => s.y)
    }

    function draw() {
      c!.clearRect(0, 0, w, h)
      for (const s of stars) {
        const tw = reduced ? 0.7 : 0.55 + 0.45 * Math.sin(t * s.tw * 60 + s.ph)
        const sat = s.hue === 44 ? 24 : 85
        const light = s.hue === 44 ? 92 : 62
        c!.beginPath()
        c!.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        c!.fillStyle = `hsla(${s.hue}, ${sat}%, ${light}%, ${0.85 * tw * s.z})`
        c!.fill()
      }
    }

    function frame() {
      t += 1
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        s.y = (((baseY[i] - scrollY * s.z * 0.15) % (h + 40)) + (h + 40)) % (h + 40)
      }
      draw()
      raf = requestAnimationFrame(frame)
    }

    function init() {
      build()
      if (reduced) {
        draw()
      } else {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(frame)
      }
    }

    const onScroll = () => {
      scrollY = window.scrollY
    }
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(init, 180)
    }

    init()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
}
