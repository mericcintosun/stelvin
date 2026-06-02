import { cn } from "../lib/cn"

// Placeholder wordmark. Glyph = a sealed dot inside a revealed ring (the
// SEALED→REVEALED concept). User will swap with a final mark; nothing depends
// on an external asset here.
export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="stelvin-ring" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="hsl(37 93% 54%)" />
          <stop offset="1" stopColor="hsl(80 78% 54%)" />
        </linearGradient>
      </defs>
      {/* revealed ring */}
      <circle cx="12" cy="12" r="9" stroke="url(#stelvin-ring)" strokeWidth="1.6" />
      {/* the gap = the "reveal" opening */}
      <path d="M12 3 a9 9 0 0 1 7.4 3.9" stroke="hsl(38 12% 6%)" strokeWidth="2.4" strokeLinecap="round" />
      {/* sealed core */}
      <circle cx="12" cy="12" r="3.4" fill="hsl(37 93% 54%)" />
      <circle cx="12" cy="12" r="3.4" fill="url(#stelvin-ring)" opacity="0.5" />
    </svg>
  )
}

export function Logo({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn("group flex items-center gap-2.5", className)} aria-label="Stelvin — home">
      <LogoMark size={24} className="transition-transform duration-300 group-hover:rotate-[18deg]" />
      <span className="font-heading text-lg font-bold tracking-tight text-text">Stelvin</span>
    </button>
  )
}
