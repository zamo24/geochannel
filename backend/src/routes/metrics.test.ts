import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { MetricsRegistry } from "../lib/metrics.js";
import { registerMetricsRoutes } from "./metrics.js";

test("metrics routes require the configured bearer token", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  registerMetricsRoutes(app, new MetricsRegistry(), {
    resetEnabled: false,
    resetToken: "",
    authRequired: true,
    authToken: "metrics-secret"
  });

  const unauthorized = await app.inject({ method: "GET", url: "/metrics" });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.json().error.code, "METRICS_UNAUTHORIZED");

  const authorized = await app.inject({
    method: "GET",
    url: "/metrics",
    headers: { authorization: "Bearer metrics-secret" }
  });
  assert.equal(authorized.statusCode, 200);
  assert.match(authorized.body, /geochannel_process_uptime_seconds/);
});
