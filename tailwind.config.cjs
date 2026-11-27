/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./*.html",
    "./*.js",
    "./styles/*.css"
  ],
  safelist: [
    "translate-y-0",
    "translate-y-24",
    "opacity-0",
    "opacity-100",
    "hidden",
    "flex",
    "grid",
    "block",
    "col-span-2",
    "col-span-3",
    "xl:col-span-2"
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#050508",
        "surface-1": "#0C0D15",
        "surface-2": "#131522",
        volt: "#D4FF00",
        "cyan-tx": "#00F2FF",
        "emerald-tx": "#00FF7F",
        "amber-tx": "#FFB020",
        "crimson-tx": "#FF4655",
        surface: "#131317",
        primary: "#ffd59b",
        "primary-container": "#ffb020",
        secondary: "#4edea3",
        error: "#ffb4ab"
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        orbitron: ["Orbitron", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        body: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"]
      }
    }
  },
  plugins: []
};
