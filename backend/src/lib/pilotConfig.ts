type PilotConfig = {
  INGEST_AUTH_REQUIRED: boolean;
  INGEST_API_KEYS: string;
  CHANNEL_AUTH_REQUIRED: boolean;
  TOKEN_AUTH_REQUIRED: boolean;
  TENANT_API_KEYS: string;
  STREAM_AUTH_REQUIRED: boolean;
  STREAM_TOKEN_SECRET: string;
  TOKEN_MINT_RATE_LIMIT_PER_MIN: number;
  METRICS_AUTH_REQUIRED: boolean;
  METRICS_AUTH_TOKEN: string;
  CORS_ORIGINS: string;
  MAX_TILES_PER_CHANNEL: number;
  MAX_CHANNEL_TILE_MATERIALIZATION: number;
  MAX_CHANNELS_PER_TENANT_HOUR: number;
  MAX_CHANNELS_PER_TENANT_ACTIVE: number;
  INGEST_RATE_LIMIT_EVENTS_PER_SEC: number;
  STREAM_RETENTION_MS: number;
  MAX_STREAM_SUBSCRIBERS_PER_TENANT: number;
  MAX_STREAM_SUBSCRIBERS_PER_CHANNEL: number;
};

const UNSAFE_STREAM_SECRETS = new Set(["", "dev-stream-secret", "change-me", "secret"]);

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized.includes("replace") || normalized.includes("change-me");
}

export function validatePilotConfig(config: PilotConfig) {
  const failures: string[] = [];
  if (!config.INGEST_AUTH_REQUIRED) failures.push("INGEST_AUTH_REQUIRED must be true.");
  if (isPlaceholder(config.INGEST_API_KEYS)) failures.push("INGEST_API_KEYS must be configured.");
  if (!config.CHANNEL_AUTH_REQUIRED) failures.push("CHANNEL_AUTH_REQUIRED must be true.");
  if (!config.TOKEN_AUTH_REQUIRED) failures.push("TOKEN_AUTH_REQUIRED must be true.");
  if (isPlaceholder(config.TENANT_API_KEYS)) failures.push("TENANT_API_KEYS must be configured.");
  if (!config.STREAM_AUTH_REQUIRED) failures.push("STREAM_AUTH_REQUIRED must be true.");
  if (config.TOKEN_MINT_RATE_LIMIT_PER_MIN <= 0) {
    failures.push("TOKEN_MINT_RATE_LIMIT_PER_MIN must be greater than zero.");
  }
  if (!config.METRICS_AUTH_REQUIRED) failures.push("METRICS_AUTH_REQUIRED must be true.");
  if (isPlaceholder(config.METRICS_AUTH_TOKEN) || config.METRICS_AUTH_TOKEN.trim().length < 32) {
    failures.push("METRICS_AUTH_TOKEN must be a non-default secret of at least 32 characters.");
  }

  const streamSecret = config.STREAM_TOKEN_SECRET.trim();
  if (UNSAFE_STREAM_SECRETS.has(streamSecret) || isPlaceholder(streamSecret) || streamSecret.length < 32) {
    failures.push("STREAM_TOKEN_SECRET must be a non-default secret of at least 32 characters.");
  }

  const origins = config.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.includes("*")) {
    failures.push("CORS_ORIGINS must contain explicit trusted origins.");
  }
  if (config.MAX_TILES_PER_CHANNEL <= 0) failures.push("MAX_TILES_PER_CHANNEL must be greater than zero.");
  if (config.MAX_CHANNEL_TILE_MATERIALIZATION < config.MAX_TILES_PER_CHANNEL) {
    failures.push("MAX_CHANNEL_TILE_MATERIALIZATION must be at least MAX_TILES_PER_CHANNEL.");
  }
  if (config.MAX_CHANNELS_PER_TENANT_HOUR <= 0) {
    failures.push("MAX_CHANNELS_PER_TENANT_HOUR must be greater than zero.");
  }
  if (config.MAX_CHANNELS_PER_TENANT_ACTIVE <= 0) {
    failures.push("MAX_CHANNELS_PER_TENANT_ACTIVE must be greater than zero.");
  }
  if (config.INGEST_RATE_LIMIT_EVENTS_PER_SEC <= 0) {
    failures.push("INGEST_RATE_LIMIT_EVENTS_PER_SEC must be greater than zero.");
  }
  if (config.STREAM_RETENTION_MS <= 0) {
    failures.push("STREAM_RETENTION_MS must be greater than zero.");
  }
  if (config.MAX_STREAM_SUBSCRIBERS_PER_TENANT <= 0) {
    failures.push("MAX_STREAM_SUBSCRIBERS_PER_TENANT must be greater than zero.");
  }
  if (config.MAX_STREAM_SUBSCRIBERS_PER_CHANNEL <= 0) {
    failures.push("MAX_STREAM_SUBSCRIBERS_PER_CHANNEL must be greater than zero.");
  }
  return failures;
}
