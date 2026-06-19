import assert from "node:assert/strict";
import test from "node:test";
import { validatePilotConfig } from "./pilotConfig.js";

const safeConfig = {
  INGEST_AUTH_REQUIRED: true,
  INGEST_API_KEYS: "acme:ingest-key",
  CHANNEL_AUTH_REQUIRED: true,
  TOKEN_AUTH_REQUIRED: true,
  TENANT_API_KEYS: "acme:tenant-key",
  STREAM_AUTH_REQUIRED: true,
  STREAM_TOKEN_SECRET: "a-secure-stream-token-secret-value",
  TOKEN_MINT_RATE_LIMIT_PER_MIN: 60,
  METRICS_AUTH_REQUIRED: true,
  METRICS_AUTH_TOKEN: "a-secure-metrics-auth-token-value",
  CORS_ORIGINS: "https://pilot.example.com",
  MAX_TILES_PER_CHANNEL: 5000,
  MAX_CHANNEL_TILE_MATERIALIZATION: 20000,
  MAX_CHANNELS_PER_TENANT_HOUR: 100,
  MAX_CHANNELS_PER_TENANT_ACTIVE: 20,
  INGEST_RATE_LIMIT_EVENTS_PER_SEC: 500,
  STREAM_RETENTION_MS: 900000,
  MAX_STREAM_SUBSCRIBERS_PER_TENANT: 25,
  MAX_STREAM_SUBSCRIBERS_PER_CHANNEL: 25
};

test("validatePilotConfig accepts an explicitly protected pilot config", () => {
  assert.deepEqual(validatePilotConfig(safeConfig), []);
});

test("validatePilotConfig rejects demo auth, CORS, secret, and quota defaults", () => {
  const failures = validatePilotConfig({
    ...safeConfig,
    INGEST_AUTH_REQUIRED: false,
    CHANNEL_AUTH_REQUIRED: false,
    TOKEN_AUTH_REQUIRED: false,
    INGEST_API_KEYS: "pilot:replace-with-ingest-key",
    TENANT_API_KEYS: "pilot:replace-with-tenant-key",
    STREAM_AUTH_REQUIRED: false,
    STREAM_TOKEN_SECRET: "replace-with-at-least-32-random-characters",
    TOKEN_MINT_RATE_LIMIT_PER_MIN: 0,
    METRICS_AUTH_REQUIRED: false,
    METRICS_AUTH_TOKEN: "replace-with-at-least-32-random-characters",
    CORS_ORIGINS: "*",
    MAX_CHANNELS_PER_TENANT_ACTIVE: 0,
    INGEST_RATE_LIMIT_EVENTS_PER_SEC: 0,
    STREAM_RETENTION_MS: 0,
    MAX_STREAM_SUBSCRIBERS_PER_TENANT: 0,
    MAX_STREAM_SUBSCRIBERS_PER_CHANNEL: 0
  });
  assert.ok(failures.length >= 11);
});
