/** Colors come from theme/tokens.css (05 §7) so there is one source. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        space: "var(--space)",
        bg: "var(--bg)",
        panel: "var(--panel)",
        border: "var(--panel-border)",
        text: "var(--text)",
        dim: "var(--text-dim)",
        fire: "var(--fire)",
        "fire-hot": "var(--fire-hot)",
        danger: "var(--danger)",
        cool: "var(--cool)",
        mock: "var(--mock)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        space: ['"Space Grotesk"', "Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
