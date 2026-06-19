const H3_RES_INGEST = Number.parseInt(process.env.H3_RES_INGEST ?? "9", 10);
const TENANT_AUTH_REQUIRED = readBool("TENANT_AUTH_REQUIRED", false);

function readBool(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export const env = {
  PILOT_MODE: readBool("PILOT_MODE", false),
  PORT: Number.parseInt(process.env.PORT ?? "8081", 10),
  HOST: process.env.HOST ?? "0.0.0.0",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? "",
  INGEST_AUTH_REQUIRED: readBool("INGEST_AUTH_REQUIRED", false),
  INGEST_API_KEYS: process.env.INGEST_API_KEYS ?? "",
  TENANT_AUTH_REQUIRED,
  TENANT_API_KEYS: process.env.TENANT_API_KEYS ?? process.env.INGEST_API_KEYS ?? "",
  CHANNEL_AUTH_REQUIRED: readBool("CHANNEL_AUTH_REQUIRED", TENANT_AUTH_REQUIRED),
  TOKEN_AUTH_REQUIRED: readBool("TOKEN_AUTH_REQUIRED", TENANT_AUTH_REQUIRED),
  INGEST_MAX_BODY_BYTES: Number.parseInt(process.env.INGEST_MAX_BODY_BYTES ?? "1048576", 10),
  INGEST_MAX_EVENTS_PER_REQUEST: Number.parseInt(process.env.INGEST_MAX_EVENTS_PER_REQUEST ?? "1000", 10),
  INGEST_IDEMPOTENCY_TTL_SEC: Number.parseInt(process.env.INGEST_IDEMPOTENCY_TTL_SEC ?? "600", 10),
  INGEST_RATE_LIMIT_EVENTS_PER_SEC: Number.parseInt(process.env.INGEST_RATE_LIMIT_EVENTS_PER_SEC ?? "0", 10),
  INGEST_PRESSURE_SHED_ENABLED: readBool("INGEST_PRESSURE_SHED_ENABLED", true),
  INGEST_PRESSURE_WAITING_SUBSCRIBERS_SOFT_LIMIT: Number.parseInt(
    process.env.INGEST_PRESSURE_WAITING_SUBSCRIBERS_SOFT_LIMIT ?? "120",
    10
  ),
  INGEST_PRESSURE_PENDING_FRAMES_SOFT_LIMIT: Number.parseInt(
    process.env.INGEST_PRESSURE_PENDING_FRAMES_SOFT_LIMIT ?? "60000",
    10
  ),
  INGEST_PRESSURE_PENDING_BYTES_SOFT_LIMIT: Number.parseInt(
    process.env.INGEST_PRESSURE_PENDING_BYTES_SOFT_LIMIT ?? "134217728",
    10
  ),
  INGEST_PRESSURE_MAX_SHED_FRACTION: Number.parseFloat(process.env.INGEST_PRESSURE_MAX_SHED_FRACTION ?? "0.8"),
  STREAM_AUTH_REQUIRED: readBool("STREAM_AUTH_REQUIRED", false),
  STREAM_TOKEN_SECRET: process.env.STREAM_TOKEN_SECRET ?? "dev-stream-secret",
  STREAM_TOKEN_PREVIOUS_SECRETS: process.env.STREAM_TOKEN_PREVIOUS_SECRETS ?? "",
  STREAM_TOKEN_TTL_SEC: Number.parseInt(process.env.STREAM_TOKEN_TTL_SEC ?? "300", 10),
  STREAM_TOKEN_TTL_MIN_SEC: Number.parseInt(process.env.STREAM_TOKEN_TTL_MIN_SEC ?? "30", 10),
  STREAM_TOKEN_TTL_MAX_SEC: Number.parseInt(process.env.STREAM_TOKEN_TTL_MAX_SEC ?? "3600", 10),
  TOKEN_MINT_RATE_LIMIT_PER_MIN: Number.parseInt(process.env.TOKEN_MINT_RATE_LIMIT_PER_MIN ?? "0", 10),
  H3_RES_INGEST,
  H3_RES_STREAM_MIN: Number.parseInt(process.env.H3_RES_STREAM_MIN ?? "0", 10),
  H3_RES_STREAM_MAX: Number.parseInt(process.env.H3_RES_STREAM_MAX ?? String(H3_RES_INGEST), 10),
  STREAM_RETENTION_MS: Number.parseInt(process.env.STREAM_RETENTION_MS ?? "0", 10),
  STREAM_MAXLEN: Number.parseInt(process.env.STREAM_MAXLEN ?? "10000", 10),
  CHANNEL_TTL_SEC: Number.parseInt(process.env.CHANNEL_TTL_SEC ?? "300", 10),
  CHANNEL_TTL_MIN_SEC: Number.parseInt(process.env.CHANNEL_TTL_MIN_SEC ?? "30", 10),
  CHANNEL_TTL_MAX_SEC: Number.parseInt(process.env.CHANNEL_TTL_MAX_SEC ?? "3600", 10),
  MAX_TILES_PER_CHANNEL: Number.parseInt(process.env.MAX_TILES_PER_CHANNEL ?? "5000", 10),
  MAX_CHANNEL_TILE_MATERIALIZATION: Number.parseInt(process.env.MAX_CHANNEL_TILE_MATERIALIZATION ?? "20000", 10),
  MAX_CHANNELS_PER_TENANT_HOUR: Number.parseInt(process.env.MAX_CHANNELS_PER_TENANT_HOUR ?? "100", 10),
  MAX_CHANNELS_PER_TENANT_ACTIVE: Number.parseInt(process.env.MAX_CHANNELS_PER_TENANT_ACTIVE ?? "0", 10),
  MAX_POLYGON_POINTS: Number.parseInt(process.env.MAX_POLYGON_POINTS ?? "2000", 10),
  STREAM_READ_COUNT: Number.parseInt(process.env.STREAM_READ_COUNT ?? "250", 10),
  STREAM_READ_COUNT_ADAPTIVE: readBool("STREAM_READ_COUNT_ADAPTIVE", false),
  STREAM_READ_COUNT_MIN: Number.parseInt(process.env.STREAM_READ_COUNT_MIN ?? "50", 10),
  STREAM_READ_COUNT_MAX: Number.parseInt(process.env.STREAM_READ_COUNT_MAX ?? "500", 10),
  STREAM_BLOCK_MS: Number.parseInt(process.env.STREAM_BLOCK_MS ?? "10000", 10),
  STREAM_AGGREGATE_MAX_RES: Number.parseInt(process.env.STREAM_AGGREGATE_MAX_RES ?? "6", 10),
  STREAM_AGGREGATE_WINDOW_MS: Number.parseInt(process.env.STREAM_AGGREGATE_WINDOW_MS ?? "5000", 10),
  STREAM_THIN_MAX_EVENTS_PER_TILE_READ: Number.parseInt(process.env.STREAM_THIN_MAX_EVENTS_PER_TILE_READ ?? "0", 10),
  STREAM_EVENT_BATCH_MAX_FRAMES: Number.parseInt(process.env.STREAM_EVENT_BATCH_MAX_FRAMES ?? "40", 10),
  STREAM_EVENT_BATCH_MAX_BYTES: Number.parseInt(process.env.STREAM_EVENT_BATCH_MAX_BYTES ?? "65536", 10),
  STREAM_MAX_PENDING_FRAMES: Number.parseInt(process.env.STREAM_MAX_PENDING_FRAMES ?? "800", 10),
  STREAM_MAX_PENDING_BYTES: Number.parseInt(process.env.STREAM_MAX_PENDING_BYTES ?? "6291456", 10),
  MAX_STREAM_SUBSCRIBERS_PER_TENANT: Number.parseInt(process.env.MAX_STREAM_SUBSCRIBERS_PER_TENANT ?? "0", 10),
  MAX_STREAM_SUBSCRIBERS_PER_CHANNEL: Number.parseInt(process.env.MAX_STREAM_SUBSCRIBERS_PER_CHANNEL ?? "0", 10),
  STREAM_SUBSCRIBER_LEASE_SEC: Number.parseInt(process.env.STREAM_SUBSCRIBER_LEASE_SEC ?? "60", 10),
  STREAM_CURSOR_TTL_SEC: Number.parseInt(process.env.STREAM_CURSOR_TTL_SEC ?? "3600", 10),
  STREAM_BACKPRESSURE_PAUSE_MS: Number.parseInt(process.env.STREAM_BACKPRESSURE_PAUSE_MS ?? "2", 10),
  STREAM_BACKPRESSURE_PAUSE_THRESHOLD_PCT: Number.parseInt(process.env.STREAM_BACKPRESSURE_PAUSE_THRESHOLD_PCT ?? "95", 10),
  METRICS_RESET_ENABLED: readBool("METRICS_RESET_ENABLED", false),
  METRICS_RESET_TOKEN: process.env.METRICS_RESET_TOKEN ?? "",
  METRICS_AUTH_REQUIRED: readBool("METRICS_AUTH_REQUIRED", false),
  METRICS_AUTH_TOKEN: process.env.METRICS_AUTH_TOKEN ?? ""
};
