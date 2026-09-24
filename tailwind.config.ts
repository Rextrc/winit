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
        // Flat charcoal surfaces with a faint cool cast — the shared look of
        // modern crypto-casino lobbies, not any one site's palette.
        base: {
          900: "#0b0e14",
          800: "#12161e",
          700: "#191e28",
          600: "#212733",
          500: "#2a3140",
          400: "#374052",
          300: "#4a5468",
        },
        // Primary call-to-action: a saturated violet for Bet / Deal / Spin.
        brand: {
          DEFAULT: "#7c3aff",
          300: "#a78bff",
          400: "#8f5cff",
          500: "#7c3aff",
          600: "#6424e6",
          700: "#4e17b8",
        },
        // Multipliers, jackpots and big-win highlights.
        gold: "#ffc53d",
        // The app-wide accent every game references; now the same violet as
        // the primary action so the whole lobby reads as one system.
        volt: {
          DEFAULT: "#8f5cff",
          50: "#f3eeff",
          100: "#e4d9ff",
          200: "#cbb6ff",
          300: "#ae8cff",
          400: "#8f5cff",
          500: "#7c3aff",
          600: "#6424e6",
          700: "#4e17b8",
          800: "#361080",
        },
        // Win stays a distinct positive hue but is pulled toward cyan so it
        // sits inside the blue palette instead of fighting it.
        win: "#22dd7a",
        loss: "#ff5a6e",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        volt: "0 0 0 1px rgba(124,58,255,0.35), 0 8px 30px -12px rgba(124,58,255,0.55)",
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
          "0%": { transform: "translate(60px, -46px) rotate(-14deg) scale(0.9)", opacity: "0" },
          "55%": { opacity: "1" },
          "100%": { transform: "translate(0, 0) rotate(0) scale(1)", opacity: "1" },
        },
        // Crash rocket: engine flame flicker and a faint in-flight shake.
        flame: {
          "0%, 100%": { transform: "scaleY(1) scaleX(1)", opacity: "0.95" },
          "50%": { transform: "scaleY(1.35) scaleX(0.85)", opacity: "0.75" },
        },
        "rocket-shake": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "25%": { transform: "translate(0.6px, -0.6px)" },
          "75%": { transform: "translate(-0.6px, 0.6px)" },
        },
        boom: {
          "0%": { transform: "translate(-50%, -50%) scale(0.2)", opacity: "1" },
          "100%": { transform: "translate(-50%, -50%) scale(2.6)", opacity: "0" },
        },
        shard: {
          "0%": { transform: "translate(-50%, -50%)", opacity: "1" },
          "100%": { transform: "translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(220deg)", opacity: "0" },
        },
        "star-drift": {
          "0%": { transform: "translate(0, 0)" },
          "100%": { transform: "translate(-60px, 90px)" },
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
        // `backwards` matters as much as the delay itself: without it, a card
        // with a positive animation-delay renders at its normal resting
        // opacity (1, in place) for the whole delay instead of staying hidden
        // until its turn — which is what silently made every staggered
        // per-card delayMs across the app invisible, and every hand look like
        // it dealt in one frame no matter what delay was passed in.
        "card-deal": "card-deal 0.55s cubic-bezier(0.22,1,0.36,1) backwards",
        "float-up": "float-up 1.6s ease-out forwards",
        marquee: "marquee 26s linear infinite",
        "confetti-fall": "confetti-fall linear forwards",
        "banner-in": "banner-in 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        "banner-out": "banner-out 0.25s ease-in forwards",
        "win-pulse": "win-pulse 1.1s ease-out 3",
        "chip-drop": "chip-drop 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        "felt-sweep": "felt-sweep 1.8s ease-in-out infinite",
        flame: "flame 0.14s ease-in-out infinite",
        "rocket-shake": "rocket-shake 0.12s linear infinite",
        "star-drift": "star-drift 3s linear infinite",
        boom: "boom 0.75s ease-out forwards",
        shard: "shard 0.9s cubic-bezier(0.2,0.7,0.3,1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
