/** @type {import('tailwindcss').Config} */
// Stelvin theme — maps the SEALED→REVEALED token system (src/theme/tokens.css)
// into Tailwind utilities. HSL channels are stored bare so colors compose with
// opacity: e.g. `bg-sealed/20`, `text-revealed`, `border-border`.
const hsl = (v) => `hsl(var(${v}) / <alpha-value>)`

module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: hsl("--bg"),
        "bg-soft": hsl("--bg-soft"),
        surface: hsl("--surface"),
        "surface-2": hsl("--surface-2"),
        border: hsl("--border"),
        "border-soft": hsl("--border-soft"),
        text: hsl("--text"),
        "text-dim": hsl("--text-dim"),
        "text-muted": hsl("--text-muted"),
        sealed: {
          300: hsl("--sealed-300"),
          400: hsl("--sealed-400"),
          DEFAULT: hsl("--sealed"),
          600: hsl("--sealed-600"),
          700: hsl("--sealed-700"),
        },
        revealed: {
          300: hsl("--revealed-300"),
          DEFAULT: hsl("--revealed"),
          600: hsl("--revealed-600"),
          700: hsl("--revealed-700"),
        },
        attack: { DEFAULT: hsl("--attack"), dim: hsl("--attack-dim") },
        warn: hsl("--warn"),
      },
      fontFamily: {
        heading: ["Space Grotesk", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // fluid display sizes for the hero / section titles
        "display": ["clamp(2.6rem, 6vw, 5rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "h2": ["clamp(1.9rem, 3.6vw, 3rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        "h3": ["clamp(1.25rem, 2vw, 1.6rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        sealed: "var(--glow-sealed)",
        revealed: "var(--glow-revealed)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        soft: "var(--ease-soft)",
      },
      maxWidth: { content: "72rem" },
      keyframes: {
        "beacon-ring": {
          "0%": { transform: "scale(0.7)", opacity: "0.55" },
          "70%": { opacity: "0" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        "shine-sweep": {
          "0%": { backgroundPosition: "180% center" },
          "100%": { backgroundPosition: "-80% center" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "beacon-ring": "beacon-ring 3.2s var(--ease-out) infinite",
        twinkle: "twinkle 4s ease-in-out infinite",
        "shine-sweep": "shine-sweep 6s linear infinite",
        float: "float 7s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
