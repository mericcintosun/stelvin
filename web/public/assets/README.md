# Stelvin web — brand assets

Drop final brand assets here and they're picked up with **no code changes**
(paths are already wired in `index.html` and components). Until you do, the site
runs fully on the procedural starfield + the SVG `LogoMark` placeholder — nothing
blocks on a missing asset.

| File | Used by | Spec |
|---|---|---|
| `favicon.svg` | `index.html` `<link rel="icon">` | square SVG, dark-safe (placeholder provided) |
| `og-image.png` | `index.html` OG / Twitter card | **1200 × 630 px**, PNG. Dark bg `#0a0b14`, wordmark + tagline. |
| `logo.svg` *(optional)* | swap into `src/components/Logo.tsx` | horizontal lockup; transparent bg |
| `hero.png` / `hero.webp` *(optional)* | drop into the Hero in `src/pages/Landing.tsx` | ≥1600px wide, transparent or dark bg |

## Palette (for whoever designs the assets)
- Background: `#0a0b14` (deep indigo-navy — **not** flat black)
- Sealed (primary): `#7b6cf9` electric indigo-violet
- Revealed (secondary): `#29e0b8` aqua-mint
- Text: `#f2f5fb`

Keep gold **out** of the palette — it belongs to another project in this ecosystem;
Stelvin's signature is the indigo→mint "sealed → revealed" gradient. See
[`../../BRAND.md`](../../BRAND.md).

## Fonts
Space Grotesk (headings) · Inter (body) · JetBrains Mono (numbers/code).
