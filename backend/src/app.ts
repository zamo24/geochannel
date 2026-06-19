import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./config.js";
import { registerErrorHandler } from "./http/errors.js";
import { parseIngestApiKeys, parseTenantApiKeys } from "./lib/core.js";
import { createRedis } from "./redis.js";
import { MetricsRegistry } from "./lib/metrics.js";
import { StreamPressureRegistry } from "./lib/pressure.js";
import { validatePilotConfig } from "./lib/pilotConfig.js";
import { resolveRequestId } from "./lib/requestId.js";
import { registerChannelRoutes } from "./routes/channels.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerIngestRoutes } from "./routes/ingest.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerTokenRoutes } from "./routes/token.js";

export async function buildApp() {
  if (env.PILOT_MODE) {
    const failures = validatePilotConfig(env);
    if (failures.length > 0) {
      throw new Error(`Unsafe pilot configuration:\n- ${failures.join("\n- ")}`);
    }
  }

  const app = Fastify({
    bodyLimit: env.INGEST_MAX_BODY_BYTES,
    genReqId: (request) => resolveRequestId(request.headers["x-request-id"]),
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS.trim()
      ? env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
      : true,
    exposedHeaders: ["x-request-id"]
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  const ingestApiKeyIndex = parseIngestApiKeys(env.INGEST_API_KEYS);
  const tenantApiKeyIndex = parseTenantApiKeys(env.TENANT_API_KEYS);
  if (env.INGEST_AUTH_REQUIRED && ingestApiKeyIndex.size === 0) {
    throw new Error("INGEST_AUTH_REQUIRED is enabled but INGEST_API_KEYS is empty or invalid.");
  }
  if (env.CHANNEL_AUTH_REQUIRED && tenantApiKeyIndex.size === 0) {
    throw new Error("CHANNEL_AUTH_REQUIRED is enabled but TENANT_API_KEYS is empty or invalid.");
  }
  if (env.TOKEN_AUTH_REQUIRED && tenantApiKeyIndex.size === 0) {
    throw new Error("TOKEN_AUTH_REQUIRED is enabled but TENANT_API_KEYS is empty or invalid.");
  }
  if (env.STREAM_AUTH_REQUIRED && env.STREAM_TOKEN_SECRET.trim().length === 0) {
    throw new Error("STREAM_AUTH_REQUIRED is enabled but STREAM_TOKEN_SECRET is empty.");
  }
  if (env.METRICS_AUTH_REQUIRED && env.METRICS_AUTH_TOKEN.trim().length === 0) {
    throw new Error("METRICS_AUTH_REQUIRED is enabled but METRICS_AUTH_TOKEN is empty.");
  }

  registerErrorHandler(app);

  const redis = createRedis(env.REDIS_URL);
  const metrics = new MetricsRegistry();
  const pressure = new StreamPressureRegistry();
  registerHealthRoutes(app, redis);
  registerMetricsRoutes(app, metrics, {
    resetEnabled: env.METRICS_RESET_ENABLED,
    resetToken: env.METRICS_RESET_TOKEN,
    authRequired: env.METRICS_AUTH_REQUIRED,
    authToken: env.METRICS_AUTH_TOKEN
  });
  registerIngestRoutes(app, redis, ingestApiKeyIndex, metrics, pressure);
  registerChannelRoutes(app, redis, tenantApiKeyIndex);
  registerTokenRoutes(app, redis, tenantApiKeyIndex);
  registerStreamRoutes(app, redis, metrics, pressure);

  app.addHook("onClose", async () => {
    await redis.quit();
  });

  return app;
}
