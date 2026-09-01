import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // WinIt palette — near-black with a blue cast, and a single accent hue
        // ("volt", an electric blue) used for every call to action. The scale
        // keeps its name because the whole app references it; only the hue
        // moved, from lime to blue.
        base: {
          900: "#03060e",
          800: "#070c1a",
          700: "#0b1426",
          600: "#111d36",
          500: "#182746",
          400: "#22355c",
          300: "#33497e",
        },
        volt: {
          DEFAULT: "#2e8bff",
          50: "#e9f3ff",
          100: "#cfe5ff",
          200: "#a3ceff",
          300: "#6fb1ff",
          400: "#2e8bff",
          500: "#0d6ef0",
          600: "#0056c6",
          700: "#014094",
          800: "#012c67",
        },
        // Win stays a distinct positive hue but is pulled toward cyan so it
        // sits inside the blue palette instead of fighting it.
        win: "#2ee6b8",
        loss: "#ff5a6e",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        volt: "0 0 0 1px rgba(46,139,255,0.40), 0 8px 30px -10px rgba(46,139,255,0.55)",
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
        "confetti-fall": {
          "0%": { transform: "translateY(-10vh) rotate(0deg)", opacity: "0" },
          "8%": { opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(720deg)", opacity: "0.9" },
        },
        "banner-in": {
          "0%": { transform: "scale(0.6) translateY(10px)", opacity: "0" },
          "60%": { transform: "scale(1.05) translateY(0)", opacity: "1" },
          "100%": { transform: "scale(1) translateY(0)", opacity: "1" },
        },
        "banner-out": {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.9)", opacity: "0" },
        },
        // Roulette: the winning pocket and every region covering it.
        "win-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(240,199,94,0.85)" },
          "50%": { boxShadow: "0 0 0 5px rgba(240,199,94,0)" },
        },
        "chip-drop": {
          "0%": { transform: "translateY(-14px) scale(0.6)", opacity: "0" },
          "70%": { transform: "translateY(1px) scale(1.08)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "felt-sweep": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
      },
      animation: {
        "reel-spin": "reel-spin 0.28s linear infinite",
        "pop-in": "pop-in 0.25s ease-out",
        "card-deal": "card-deal 0.35s ease-out",
        "float-up": "float-up 1.6s ease-out forwards",
        marquee: "marquee 26s linear infinite",
        "confetti-fall": "confetti-fall linear forwards",
        "banner-in": "banner-in 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        "banner-out": "banner-out 0.25s ease-in forwards",
        "win-pulse": "win-pulse 1.1s ease-out 3",
        "chip-drop": "chip-drop 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        "felt-sweep": "felt-sweep 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
