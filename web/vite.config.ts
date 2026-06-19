import { defineConfig } from "vite";
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1100,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/stream": { target: "http://localhost:8081", changeOrigin: true },
      "/ingest": { target: "http://localhost:8081", changeOrigin: true },
      "/channels": { target: "http://localhost:8081", changeOrigin: true },
      "/token": { target: "http://localhost:8081", changeOrigin: true },
      "/metrics": { target: "http://localhost:8081", changeOrigin: true },
    },
  },
});
