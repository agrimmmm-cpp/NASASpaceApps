import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// I-18: fixed port 5173; /api proxied to the backend on :8000. I-20: relative base, no CDN.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:8000" },
  },
});
