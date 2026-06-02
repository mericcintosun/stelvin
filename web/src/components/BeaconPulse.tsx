import { cn } from "../lib/cn"

// The drand "beacon": a sealed core emitting expanding rings on the ~drand
// cadence. Pure CSS animation (keyframe `beacon-ring` in tailwind config),
// so it costs nothing and freezes under prefers-reduced-motion.
export function BeaconPulse({ className }: { className?: string }) {
  return (
    <div className={cn("relative grid place-items-center", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-24 w-24 rounded-full border border-sealed/40 animate-beacon-ring"
          style={{ animationDelay: `${i * 1.06}s` }}
        />
      ))}
      <span className="absolute h-24 w-24 rounded-full bg-sealed/10 blur-xl" />
      {/* core: sealed indigo with a revealed-mint inner glint */}
      <span className="relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-sealed to-sealed-700 shadow-sealed">
        <span className="h-2.5 w-2.5 rounded-full bg-revealed shadow-[0_0_12px_2px_hsl(168_84%_56%/0.9)]" />
      </span>
    </div>
  )
}
