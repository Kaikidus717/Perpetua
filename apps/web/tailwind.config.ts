import type { Config } from "tailwindcss";

/// Deliberately plain: a white canvas, near-black text, one green for money figures and one amber
/// for warnings. No gradient, no glow, no dark chrome, and no second accent colour competing with
/// the numbers for attention.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#ffffff",
        ink: "#18181b",
        muted: "#71717a",
        line: "#e4e4e7",
        panel: "#fafafa",
        accent: "#15803d",
        warn: "#b45309",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
