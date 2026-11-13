import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser always talks to /ws and /api on the page's own host; in dev, Vite forwards them to the game server.
const port = process.env.PORT || "8787";
const gameServer = {
  "/ws": { target: `ws://localhost:${port}`, ws: true },
  "/api": { target: `http://localhost:${port}` },
};

export default defineConfig({
  // Overridable so the dev server can run where node_modules is read-only.
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173, strictPort: true, proxy: gameServer,
    // Set VITE_POLL=1 where file events don't arrive (some sandboxes).
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
  },
  preview: { proxy: gameServer },
});
