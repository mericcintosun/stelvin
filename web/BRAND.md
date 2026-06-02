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
| **Sealed** | hidden, locked, private, pre-reveal | cold **electric indigo-violet** (primary) |
| **Revealed** | opened, fair, cleared, public | bright **aqua-mint** (secondary) |

So the palette is *semantic*, not decorative. In the demo, the moment of `settle`
visually transitions sealed-indigo → revealed-mint — the "money moment." Indigo
is the resting brand color; mint is reserved for truth/fairness/success accents
and the reveal burst, so it stays meaningful.

## Palette

Deep-space base with a faint indigo undertone — **never flat black** (a deliberate
break from the reference). Tokens live in [`src/theme/tokens.css`](./src/theme/tokens.css)
as raw HSL channels and are exposed through Tailwind in [`tailwind.config.js`](./tailwind.config.js).

- **Base** `--bg hsl(233 42% 5.5%)` ≈ deep indigo-navy; surfaces step up in lightness with indigo-tinted borders.
- **Sealed (primary)** `--sealed hsl(251 90% 66%)` + 300/400/600/700 ramp.
- **Revealed (secondary)** `--revealed hsl(168 84% 56%)` + 300/600/700 ramp.
- **Attack** `--attack hsl(356 82% 63%)` — coral red, used only for the MEV/sandwich loss.
- **Warn** `--warn hsl(38 92% 60%)` — the "too early" countdown, used sparingly.

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

Noether's identity is **flat black + gold/amber signature + violet/blue**, Sora
headings, a Three.js light-pillar hero. Stelvin deliberately differs: **indigo-navy
base (not black)**, a **product-mapped indigo↔mint two-state system with zero gold**,
**Space Grotesk** headings, and a **canvas starfield + beacon pulse** hero. We
borrowed Noether's *craft* (spotlight cards, gradient-shimmer text, scroll-reveal
discipline, reduced-motion rigor) — not its look. Cloning the visual identity would
be both unethical and bad judge optics ("is this their own work?"); this is Stelvin's
own.
