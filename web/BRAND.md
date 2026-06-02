# Stelvin — Brand & Design System

> Voice: **understated boldness + honesty.** Show, don't tell. Every number on
> the site is real and verifiable on testnet. No hype, no overclaim — the whole
> project's credibility rests on being precise about what we do and don't do.

## Concept anchor — `SEALED → REVEALED`

Stelvin's entire mechanism is a two-state machine. An order is **sealed**
(timelock-encrypted, unreadable by anyone — operator and settler included) until
the drand beacon publishes round `R`; then it is **revealed** and the whole batch
clears at one fair price. The brand encodes exactly this:

| State | Meaning | Color role |
|---|---|---|
| **Sealed** | hidden, locked, "caution", pre-reveal | **hazard / caution amber** (primary) |
| **Revealed** | opened, fair, cleared, "go" | **hi-vis safety lime-green** (secondary) |

The palette is derived from the **Build on Stellar Hackathon** event identity —
construction / work-site: caution-amber, hazard stripes, hi-vis safety green, and
warm concrete — re-skinned onto Stelvin's two-state machine and kept fully dark.

So the palette is *semantic*, not decorative. In the demo, the moment of `settle`
visually transitions sealed-indigo → revealed-mint — the "money moment." Indigo
is the resting brand color; mint is reserved for truth/fairness/success accents
and the reveal burst, so it stays meaningful.

## Palette

Warm near-black **concrete / night-asphalt** base — **never flat black**. Tokens live
in [`src/theme/tokens.css`](./src/theme/tokens.css) as raw HSL channels and are
exposed through Tailwind in [`tailwind.config.js`](./tailwind.config.js).

- **Base** `--bg hsl(38 12% 6%)` ≈ `#12100c` warm concrete-dark; surfaces step up with warm-grey borders.
- **Sealed (primary)** `--sealed hsl(37 93% 54%)` ≈ `#f0a51f` hazard amber + 300/400/600/700 ramp.
- **Revealed (secondary)** `--revealed hsl(80 78% 54%)` ≈ `#b4dd2e` hi-vis lime + 300/600/700 ramp.
- **Attack** `--attack hsl(9 84% 57%)` — construction stop-red, used only for the MEV/sandwich loss.
- **Warn** `--warn hsl(44 96% 58%)` — the "too early" countdown, caution amber-yellow, used sparingly.

CTAs and the amber primary use **dark text** (`text-bg`) for AA contrast on the bright
hazard amber; the lime secondary likewise carries dark text.

**Contrast:** text ramp (`--text` ~16:1, `--text-dim` ~7:1, `--text-muted` ~4.6:1
on `--bg`) clears WCAG AA for body and large text in dark mode. Accents are used
for emphasis/large type, not long-form body copy.

## Typography

Space-themed, high quality, and intentionally different from the reference's Sora.

- **Headings:** **Space Grotesk** — geometric grotesk; technical, precise, a little
  futuristic. Fits "beacon / timelock / cryptography."
- **Body:** **Inter** — neutral, highly legible workhorse.
- **Numbers / addresses / code:** **JetBrains Mono** — tabular, unambiguous for
  contract addresses, prices, and round numbers (which are everywhere here).

Loaded via Google Fonts `<link>` in [`index.html`](./index.html) with system
fallbacks, so a font fetch never blocks render.

## Motion

Framer Motion (`motion`) for scroll-reveal, hover micro-interactions, and the
settle "reveal" burst. Procedural **canvas starfield** + a **beacon pulse** (rings
expanding on a ~drand cadence) instead of a heavy Three.js scene — 60fps, parallax,
twinkle, with mobile down-scaling and full `prefers-reduced-motion` support.
Easing is expo-out (`--ease-out`) for a premium "settle into place" feel. Motion is
restrained: premium and fast, never gimmicky.

## Logo

Placeholder only — a minimal wordmark with a "sealed dot → revealed ring" glyph
(see [`src/components/Logo.tsx`](./src/components/Logo.tsx)). The user will supply
final logo / illustration / OG assets; drop them into
[`public/assets/`](./public/assets/) (see its README) and swap — nothing blocks on them.

## Divergence from the Noether reference

Noether's identity is **flat black + a sleek gold signature + violet/blue**, Sora
headings, a Three.js light-pillar hero. Stelvin differs through an **industrial
work-site treatment**: a **warm concrete-dark base (not black)**, a **product-mapped
hazard-amber ↔ hi-vis-lime two-state system** drawn from the hackathon's construction
identity, **Space Grotesk** headings, and a **canvas starfield + beacon pulse** hero.
The amber here reads as *caution tape / hazard sign*, not Noether's elegant gold — a
distinct register. We borrowed Noether's *craft* (spotlight cards, gradient-shimmer
text, scroll-reveal discipline, reduced-motion rigor), not its look — this is
Stelvin's own.
