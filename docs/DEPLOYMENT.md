# GeoChannel Deployment

This guide covers local development and the requirements for a controlled,
single-region deployment. The included Compose files are reference
configurations, not a production platform.

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- Redis 7+

## Local Development

Install dependencies and start Redis plus the API:

```bash
npm ci
docker compose -f infra/docker-compose.yml up -d --build
```

Start the web demo:

```bash
npm run dev:web
```

For backend hot reload:

```bash
docker compose -f infra/docker-compose.yml up -d redis
npm run dev:backend
```

Defaults:

- Backend: `http://localhost:8081`
- Web: `http://localhost:5173`
- Redis: `localhost:6379`

## Backend Configuration

Core:

- `PORT`, `HOST`, `REDIS_URL`, `LOG_LEVEL`
- `PILOT_MODE` enables strict startup validation for externally accessible
  deployments; the name is retained for compatibility
- `CORS_ORIGINS` is a comma-separated trusted-origin allowlist

Ingest:

- `INGEST_AUTH_REQUIRED`, `INGEST_API_KEYS`
- `INGEST_MAX_BODY_BYTES`, `INGEST_MAX_EVENTS_PER_REQUEST`
- `INGEST_IDEMPOTENCY_TTL_SEC`
- `INGEST_RATE_LIMIT_EVENTS_PER_SEC`
- `STREAM_RETENTION_MS`

Tenant and stream authentication:

- `TENANT_AUTH_REQUIRED`, `TENANT_API_KEYS`
- `CHANNEL_AUTH_REQUIRED`, `TOKEN_AUTH_REQUIRED`
- `STREAM_AUTH_REQUIRED`, `STREAM_TOKEN_SECRET`
- `STREAM_TOKEN_PREVIOUS_SECRETS`
- `STREAM_TOKEN_TTL_SEC`, `STREAM_TOKEN_TTL_MIN_SEC`,
  `STREAM_TOKEN_TTL_MAX_SEC`
- `TOKEN_MINT_RATE_LIMIT_PER_MIN`

H3:

- `H3_RES_INGEST`, `H3_RES_STREAM_MIN`, `H3_RES_STREAM_MAX`

Channels and streams:

- `CHANNEL_TTL_SEC`, `CHANNEL_TTL_MIN_SEC`, `CHANNEL_TTL_MAX_SEC`
- `MAX_TILES_PER_CHANNEL`, `MAX_CHANNEL_TILE_MATERIALIZATION`
- `MAX_CHANNELS_PER_TENANT_HOUR`, `MAX_CHANNELS_PER_TENANT_ACTIVE`
- `MAX_POLYGON_POINTS`
- `STREAM_READ_COUNT`, `STREAM_BLOCK_MS`
- `STREAM_AGGREGATE_MAX_RES`, `STREAM_THIN_MAX_EVENTS_PER_TILE_READ`
- `STREAM_AGGREGATE_WINDOW_MS`, `STREAM_CURSOR_TTL_SEC`
- `STREAM_MAX_PENDING_FRAMES`, `STREAM_MAX_PENDING_BYTES`
- `MAX_STREAM_SUBSCRIBERS_PER_TENANT`,
  `MAX_STREAM_SUBSCRIBERS_PER_CHANNEL`
- `STREAM_SUBSCRIBER_LEASE_SEC`

Pressure controls:

- `INGEST_PRESSURE_SHED_ENABLED`
- `INGEST_PRESSURE_WAITING_SUBSCRIBERS_SOFT_LIMIT`
- `INGEST_PRESSURE_PENDING_FRAMES_SOFT_LIMIT`
- `INGEST_PRESSURE_PENDING_BYTES_SOFT_LIMIT`
- `INGEST_PRESSURE_MAX_SHED_FRACTION`
- `STREAM_BACKPRESSURE_PAUSE_MS`
- `STREAM_BACKPRESSURE_PAUSE_THRESHOLD_PCT`

Metrics:

- `METRICS_AUTH_REQUIRED`, `METRICS_AUTH_TOKEN`
- `METRICS_RESET_ENABLED`, `METRICS_RESET_TOKEN`

Scrape `GET /metrics` from every backend instance. Tune the starter rules in
[infra/prometheus-alerts.yml](https://github.com/zamo24/geochannel/blob/main/infra/prometheus-alerts.yml)
against your
own traffic and infrastructure.

## Web Configuration

- `VITE_API_URL`
- `VITE_TENANT_ID`
- `VITE_TENANT_API_KEY` for local or trusted demonstrations only
- `VITE_INGEST_TENANT_ID`
- `VITE_INGEST_API_KEY` for local or trusted event generation only
- `VITE_STREAM_AUTH_REQUIRED`
- `VITE_METRICS_AUTH_TOKEN` for trusted internal dashboards only
- `VITE_H3_RES_STREAM_MIN`, `VITE_H3_RES_STREAM_MAX`
- `VITE_MAX_TILES_PER_CHANNEL`

Do not place ingest, tenant, or metrics credentials in a public browser build.
Use a trusted backend such as the
[token-broker example](https://github.com/zamo24/geochannel/tree/main/examples/token-broker)
for channel and token
creation.

## Externally Accessible Deployment

Before allowing external traffic:

1. Terminate TLS at a trusted proxy or load balancer.
2. Use persistent, authenticated Redis on a private network.
3. Store all credentials in a secret manager.
4. Enable ingest, tenant, stream, and metrics authentication.
5. Configure explicit CORS origins and non-default signing secrets.
6. Set retention, rate, channel, subscriber, and pending-frame limits.
7. Configure health checks, logs, metrics, alerts, and backups.
8. Verify restore, key rotation, canary, and rollback procedures.
9. Run smoke, browser E2E, and representative load tests in the target
   environment.

The secured reference stack uses historical `pilot` filenames for
compatibility:

```bash
cp infra/pilot.env.example infra/pilot.env
# Replace every placeholder secret and trusted origin.
docker compose --env-file infra/pilot.env \
  -f infra/docker-compose.pilot.yml up -d --build
```

Validate the strict configuration:

```bash
set -a
. infra/pilot.env
set +a
PILOT_MODE=true npm --prefix backend run pilot:validate
```

The service must remain behind a proxy that supports long-lived SSE responses,
disables buffering for `/stream`, preserves `Authorization`, and uses idle
timeouts longer than the expected keepalive interval.

## Validation

```bash
npm run check
```

With backend and Redis running:

```bash
npm run test:smoke
npm --prefix backend run bench:limits:multi
```

Benchmark results are environment-specific. Establish and retain your own
baseline before using performance thresholds as release gates.

## Rollout

1. Deploy the backend to staging.
2. Run synthetic channel, token, ingest, replay, and live-stream checks.
3. Deploy the web application with matching public configuration.
4. Canary one tenant or a small traffic slice.
5. Promote only after health, latency, errors, drops, and reconnect behavior
   remain within the target environment's baseline.

See [CANARY_ROLLBACK.md](CANARY_ROLLBACK.md),
[OBSERVABILITY.md](OBSERVABILITY.md), and
[KEY_ROTATION.md](KEY_ROTATION.md).
