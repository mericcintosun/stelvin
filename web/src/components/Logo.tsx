import { cn } from "../lib/cn"

// Brand mark — the square "sealed beacon" app icon (real raster asset in /public,
// same mark as the favicon). Used small (nav / footer) next to the wordmark.
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/favicon-512.png"
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={cn("rounded-[22%] object-contain", className)}
    />
  )
}

// Full horizontal lockup (beacon mark + STELVIN wordmark) for larger brand moments.
export function LogoFull({ className }: { className?: string }) {
  return <img src="/logo.png" alt="Stelvin" className={cn("select-none", className)} />
}

export function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn("group flex items-center gap-2.5", className)} aria-label="Stelvin — home">
      <LogoMark size={26} className="transition-transform duration-300 group-hover:scale-110" />
      <span className="font-heading text-lg font-bold tracking-tight text-text">Stelvin</span>
    </button>
  )
}
