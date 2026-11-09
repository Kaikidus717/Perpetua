import type { Config } from "tailwindcss";

/// Deliberately plain: one canvas, near-black text, one green for money figures and one amber for
/// warnings. No gradient, no glow, no dark chrome, and no second accent colour competing with the
/// numbers for attention.
///
/// The seven colours are CSS variables rather than fixed hexes, which is what lets a single screen
/// opt into dark without a parallel set of class names: `[data-theme="dark"]` re-points the same
/// token names, and every existing `bg-canvas` / `text-ink` / `border-line` follows. The channel
/// triples are space-separated, so Tailwind's opacity modifiers (`bg-ink/85`) keep working in both
/// themes. Light stays the product default; see `app/globals.css` for the values.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--canvas) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accent2: "rgb(var(--accent-2) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
      },
      fontFamily: {
        /// Set by `next/font` in `app/layout.tsx`; the fallbacks are the old stack, so a reader who
        /// blocks web fonts gets a sane page rather than Times.
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
