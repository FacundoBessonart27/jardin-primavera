import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        dusk: {
          900: "#1a1030",
          800: "#241640",
          700: "#33205a",
        },
        blossom: {
          100: "#ffe7ef",
          200: "#ffc9dd",
          300: "#ff9dc3",
          400: "#ff6fa5",
          500: "#f0468a",
        },
        gold: {
          200: "#ffe9b8",
          300: "#ffd688",
          400: "#f7b955",
        },
        meadow: {
          900: "#0f2a1e",
          800: "#163a28",
          700: "#1f4f35",
          600: "#2c6b47",
          500: "#3f8c5c",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
