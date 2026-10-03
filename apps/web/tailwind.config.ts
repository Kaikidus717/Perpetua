import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0e14",
        panel: "#131722",
        edge: "#1f2533",
        accent: "#4ade80",
      },
    },
  },
  plugins: [],
} satisfies Config;
