import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // WinIt original palette — deep slate-violet base with a single
        // accent hue ("volt", an electric lime) used for all calls to action.
        base: {
          900: "#080a12",
          800: "#0d1020",
          700: "#12162a",
          600: "#191e36",
          500: "#232945",
          400: "#2f3757",
          300: "#454e75",
        },
        volt: {
          DEFAULT: "#b6ff2e",
          50: "#f5ffe3",
          100: "#e8ffbc",
          200: "#d6ff85",
          300: "#c4ff4f",
          400: "#b6ff2e",
          500: "#98e300",
          600: "#77b300",
          700: "#578400",
          800: "#3a5800",
        },
        win: "#3ee88f",
        loss: "#ff5a6e",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        volt: "0 0 0 1px rgba(182,255,46,0.35), 0 8px 30px -10px rgba(182,255,46,0.45)",
        tile: "0 12px 32px -16px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "reel-spin": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "card-deal": {
          "0%": { transform: "translateY(-28px) rotate(-8deg)", opacity: "0" },
          "100%": { transform: "translateY(0) rotate(0)", opacity: "1" },
        },
        "float-up": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "20%": { transform: "translateY(0)", opacity: "1" },
          "80%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-16px)", opacity: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "reel-spin": "reel-spin 0.28s linear infinite",
        "pop-in": "pop-in 0.25s ease-out",
        "card-deal": "card-deal 0.35s ease-out",
        "float-up": "float-up 1.6s ease-out forwards",
        marquee: "marquee 26s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
