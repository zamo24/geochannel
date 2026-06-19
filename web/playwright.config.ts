import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_URL: "http://localhost:8081",
      VITE_TENANT_ID: "pilot",
      VITE_TENANT_API_KEY: "tenant-key",
      VITE_INGEST_TENANT_ID: "pilot",
      VITE_INGEST_API_KEY: "ingest-key",
      VITE_STREAM_AUTH_REQUIRED: "true",
      VITE_METRICS_AUTH_TOKEN: "a-secure-metrics-auth-token-value"
    }
  }
});
