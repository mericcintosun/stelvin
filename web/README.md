# Stelvin web

Marketing-grade landing + live demo for Stelvin, the timelock-sealed batch DEX.
Vite + React + Tailwind + Framer Motion. Dark theme, procedural starfield, a
custom `SEALED → REVEALED` brand system (see [`BRAND.md`](./BRAND.md)).

## Pages (hash router, no extra dep)

- **`#/` — Landing.** Single-scroll marketing page: hero (beacon pulse) → problem
  (real sandwich numbers) → solution (two layers) → live proof → how it works →
  why Stellar → honesty band (what we hide / don't) → ecosystem (Drand-Relay +
  Noether oracle) → credibility → footer.
- **`#/demo` — Live demo.** The two-panel frontrunner showdown, restyled. LEFT: a
  *simulated* transparent-AMM sandwich (real constant-product mechanics). RIGHT:
  **Stelvin live on testnet** — the same bot pulls the real on-chain ciphertext and
  the backend runs `tlock` decrypt, failing *"too early"* with a live countdown
  until the drand beacon publishes round R, then the batch settles at one uniform
  price (the "reveal" burst is the money moment). Plus the non-blocking Noether
  fair-value line.

The demo consumes the **existing** Express SSE backend ([`settler/src/server.ts`](../settler/src/server.ts))
unchanged — no contract or settler logic was touched.

## Architecture

```
src/
  theme/tokens.css     design tokens (CSS vars) + Tailwind base/utilities
  data/content.ts      all copy + on-chain addresses/figures (single source)
  lib/router.tsx       tiny hash router (#/ , #/demo)
  components/          Starfield, Nav, Footer, Logo, BeaconPulse, primitives
  pages/Landing.tsx    the marketing sections
  pages/Demo.tsx       the SSE-driven showdown
```

Brand tokens are exposed to Tailwind in [`tailwind.config.js`](./tailwind.config.js)
(`sealed`, `revealed`, `attack`, `text-dim`, …). Final logo / illustration / OG
assets drop into [`public/assets/`](./public/assets/) (see its README) with no code
changes — the site runs on the procedural starfield + SVG placeholder until then.

## Run

```sh
# 1) backend (reuses the M2 deployment in ../.stelvin/testnet.env)
cd settler && npm install && npm run server

# 2) frontend
cd web && npm install && npm run dev    # http://localhost:5173
```

Open the landing page, hit **Watch the live demo**, then **Run live demo**. A run
takes ~60–90s (it waits for the real drand round R). `demo/sample-run.txt` is a
valid backup clip if the feeder ever lags during a live pitch.

Point the demo at a deployed backend with `?backend=https://…` on the `#/demo` URL.

## Accessibility / performance

- WCAG AA contrast on the dark theme; full `prefers-reduced-motion` support
  (Framer `MotionConfig reducedMotion="user"` + CSS + a static starfield frame).
- Starfield is canvas-only (no Three.js), DPR-capped, density-reduced on mobile.
- `npm run build` → clean `tsc` + Vite build (~100 kB gzip JS).
