import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const apiBase = process.env.API_BASE ?? "http://localhost:8081";
const tenantId = process.env.PILOT_TENANT_ID ?? "pilot";
const ingestApiKey = (process.env.PILOT_INGEST_API_KEY ?? "").trim();
const tenantApiKey = (process.env.PILOT_TENANT_API_KEY ?? "").trim();
const metricsAuthToken = (process.env.PILOT_METRICS_AUTH_TOKEN ?? "").trim();
const runBenchmarks = ["1", "true", "yes", "on"].includes(
  String(process.env.PILOT_RUN_BENCHMARKS ?? "").trim().toLowerCase()
);

if (!ingestApiKey || !tenantApiKey || !metricsAuthToken) {
  throw new Error("PILOT_INGEST_API_KEY, PILOT_TENANT_API_KEY, and PILOT_METRICS_AUTH_TOKEN are required.");
}

function run(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      cwd: backendDir,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with exit code ${code}`));
    });
  });
}

const shared = {
  API_BASE: apiBase,
  TEST_TENANT_ID: tenantId,
  TEST_EXPECT_INGEST_AUTH: "1",
  TEST_INGEST_API_KEY: ingestApiKey,
  TEST_EXPECT_TENANT_AUTH: "1",
  TEST_TENANT_API_KEY: tenantApiKey,
  TEST_EXPECT_STREAM_AUTH: "1",
  TEST_EXPECT_METRICS_AUTH: "1",
  TEST_METRICS_AUTH_TOKEN: metricsAuthToken
};

await run("test:smoke", shared);
if (runBenchmarks) {
  await run("bench:limits:multi", {
    API_BASE: apiBase,
    LIMIT_TENANT_ID: tenantId,
    LIMIT_INGEST_API_KEY: ingestApiKey,
    LIMIT_TENANT_API_KEY: tenantApiKey,
    LIMIT_METRICS_AUTH_TOKEN: metricsAuthToken,
    LIMIT_STREAM_AUTH_REQUIRED: "true"
  });
  await run("bench:load-compare", {
    API_BASE: apiBase,
    BENCH_TENANT_ID: tenantId,
    BENCH_INGEST_API_KEY: ingestApiKey,
    BENCH_TENANT_API_KEY: tenantApiKey,
    BENCH_STREAM_AUTH_REQUIRED: "true"
  });
}
