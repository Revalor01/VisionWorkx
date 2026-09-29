import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Admin screens are used mostly on laptops/monitors: fill the window up
      // to this width (keep in step with revalor-admin's `admin-page`).
      maxWidth: { admin: "1760px" },
      colors: {
        navy: {
          dark: "#1A3A5C",
          DEFAULT: "#2E6DA4",
        },
        "off-white": "#F8FAFC",
        promote: {
          bg: "#0a0c10",
          bg2: "#0f1117",
          bg3: "#13161f",
          border: "#1e2130",
          accent: "#4f8ef7",
          green: "#3ecf8e",
          gold: "#e8b84b",
          red: "#f75f5f",
          purple: "#7c5cfc",
          text: "#e8eaf0",
          muted: "#8b90a0",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};
export default config;
