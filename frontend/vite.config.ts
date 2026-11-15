import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// I-18: fixed port 5173; /api proxied to the backend on :8000. I-20: relative base, no CDN.
export default defineConfig({
  base: "./",
  plugins: [react()],
  cacheDir: "node_modules/.vite", // keep Vite's cache inside node_modules (git-ignored)
  // Pre-bundle React and three.js together at startup. Without this, the lazily loaded globe makes Vite
  // re-optimise mid-session and the page ends up with two copies of React ("Invalid hook call").
  optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "zustand", "three", "@react-three/fiber"] },
  resolve: { dedupe: ["react", "react-dom", "three"] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:8000" },
  },
});
