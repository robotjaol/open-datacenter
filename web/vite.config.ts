import { defineConfig } from "vitest/config";

// Dev server proxies the Python API and exported data.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8765",
      "/data": "http://127.0.0.1:8765",
    },
  },
  build: { outDir: "dist", chunkSizeWarningLimit: 900 },
  test: { include: ["tests/**/*.test.ts"] },
});
