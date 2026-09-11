import type { Config } from "tailwindcss";

// Platform-owned. Maps the `primary` / `background` Tailwind tokens to CSS
// variables that app/layout.tsx sets at runtime from site_settings (per the
// generator's theme rule). rgb(var(--x) / <alpha-value>) is the shadcn/ui
// convention — the CSS variable must hold space-separated RGB components,
// which is what site_settings.*_color_rgb stores.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        background: "rgb(var(--color-background) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
export default config;
