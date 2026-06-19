# GeoChannel API

Local default base URL: `http://localhost:8081`

## Response Errors

All non-success responses use:

```json
{"error":{"code":"ERROR_CODE","message":"Human-readable message","details":{}}}
```

`details` is optional.

## Auth Notes

Local defaults are demo-friendly:

- `INGEST_AUTH_REQUIRED=false`
- `TENANT_AUTH_REQUIRED=false`
- `CHANNEL_AUTH_REQUIRED=false`
- `TOKEN_AUTH_REQUIRED=false`
- `STREAM_AUTH_REQUIRED=false`
- `STREAM_TOKEN_SECRET=dev-stream-secret`
- `METRICS_AUTH_REQUIRED=false`

Externally accessible environments should enable ingest, tenant, stream, and
metrics authentication with non-default secrets.

Every response includes `x-request-id`. A caller may supply a safe
`x-request-id` value for correlation; otherwise the backend generates one.

Channel creation and token minting can be protected with `x-api-key` by setting
`TENANT_AUTH_REQUIRED=true` or the route-specific `CHANNEL_AUTH_REQUIRED=true`
and `TOKEN_AUTH_REQUIRED=true`. The key map comes from `TENANT_API_KEYS`, falling
back to `INGEST_API_KEYS` when unset.

Do not expose tenant API keys in public browser deployments. For production,
mint stream tokens from trusted backend code.

## Endpoint Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process health |
| `GET` | `/health/redis` | Redis connectivity |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/metrics/summary` | Dashboard-ready metrics JSON |
| `POST` | `/metrics/reset` | Optional metrics summary reset |
| `POST` | `/ingest/events` | Ingest location event batch |
| `POST` | `/channels` | Create a channel from tiles or polygon |
| `POST` | `/token` | Mint stream bearer token |
| `GET` | `/stream` | SSE replay/live stream |

## Health

### `GET /health`

```json
{"status":"ok","service":"geochannel-backend","time":"2026-06-05T00:00:00.000Z"}
```

### `GET /health/redis`

```json
{"status":"ok","ping":"PONG"}
```

## Metrics

### `GET /metrics`

Returns Prometheus text.

Header:

- `Authorization: Bearer <metrics-token>`: required when
  `METRICS_AUTH_REQUIRED=true`

Key series:

- `geochannel_ingest_requests_total`
- `geochannel_ingest_events_total`
- `geochannel_ingest_events_rejected_total`
- `geochannel_ingest_rate_limit_rejections_total`
- `geochannel_stream_subscribers_current`
- `geochannel_stream_subscriber_limit_rejections_total`
- `geochannel_stream_cursor_resumes_total`
- `geochannel_stream_frames_sent_total`
- `geochannel_stream_bytes_sent_total`
- `geochannel_stream_frames_dropped_backpressure_total`
- `geochannel_stream_frames_dropped_invalid_total`
- `geochannel_stream_backpressure_signals_total`
- `geochannel_stream_frame_latency_ms`

### `GET /metrics/summary`

Returns dashboard JSON with process uptime, reset-window metadata, top-level
ingest/stream/latency/drop totals, latency histogram buckets, and per
tenant/mode rows.

Counter and histogram totals are relative to the current summary window.

Header:

- `Authorization: Bearer <metrics-token>`: required when
  `METRICS_AUTH_REQUIRED=true`

### `POST /metrics/reset`

Registered only when `METRICS_RESET_ENABLED=true`.

Header:

- `Authorization: Bearer <metrics-token>`: required when
  `METRICS_AUTH_REQUIRED=true`
- `x-metrics-reset-token`: required when `METRICS_RESET_TOKEN` is configured

Error:

- `METRICS_UNAUTHORIZED`
- `METRICS_RESET_UNAUTHORIZED`

## Ingest

### `POST /ingest/events`

Request body:

```json
[{"id":"asset-1","ts":"2026-06-05T00:00:00.000Z","loc":[-73.98,40.74],"attrs":{"speed":27}}]
```

Headers:

- `x-api-key`: required when `INGEST_AUTH_REQUIRED=true`
- `x-tenant-id`: optional when auth is disabled; defaults to `public`
- `Idempotency-Key`: optional retry key, max 128 chars, pattern `^[A-Za-z0-9._:-]+$`

Success:

```json
{"accepted":1,"rejected":0,"tenantId":"acme","idempotencyKey":"ingest-123","idempotencyReplay":false}
```

Behavior:

- Valid events are stamped into H3 at `H3_RES_INGEST`.
- Events are written to all configured stream resolutions.
- The request fails if any Redis stream write in the ingest pipeline fails.
- Redis keys are tenant-namespaced.
- When `STREAM_RETENTION_MS` is positive, streams are trimmed approximately by
  minimum Redis Stream ID to provide a rolling replay window.
- Otherwise, streams are trimmed by approximate `STREAM_MAXLEN`.

Errors:

- `VALIDATION_ERROR`
- `PAYLOAD_TOO_LARGE`
- `INGEST_INVALID_BODY`
- `INGEST_EVENT_LIMIT_EXCEEDED`
- `INGEST_RATE_LIMIT_EXCEEDED`
- `INGEST_NO_VALID_EVENTS`
- `INGEST_API_KEY_MISSING`
- `INGEST_API_KEY_INVALID`
- `INGEST_TENANT_INVALID`
- `IDEMPOTENCY_KEY_INVALID`
- `IDEMPOTENCY_IN_PROGRESS`
- `IDEMPOTENCY_KEY_CONFLICT`

## Channels

### `POST /channels`

Create a short-lived channel from exactly one of `tiles` or `polygon`.

Headers:

- `x-api-key`: required when `CHANNEL_AUTH_REQUIRED=true`

Tile body:

```json
{"tenantId":"acme","ttlSec":300,"res":7,"tiles":["872a1072cffffff"]}
```

Polygon body:

```json
{"tenantId":"acme","ttlSec":300,"res":7,"polygon":[[40.72,-74.01],[40.72,-73.95],[40.78,-73.95],[40.78,-74.01],[40.72,-74.01]]}
```

Success:

```json
{"channelId":"abc123","tenantId":"acme","ttlSec":300,"tilesCount":128,"res":7,"aoiRes":7}
```

Behavior:

- Input tiles are normalized to requested stream resolution.
- When channel auth is required, `tenantId` is derived from the API key.
- If a body `tenantId` is also supplied, it must match the authenticated tenant.
- TTL is clamped by channel TTL config.
- Active and hourly tenant channel limits are reserved atomically with channel storage.

Errors:

- `VALIDATION_ERROR`
- `CHANNEL_TENANT_INVALID`
- `CHANNEL_API_KEY_MISSING`
- `CHANNEL_API_KEY_INVALID`
- `CHANNEL_TENANT_MISMATCH`
- `CHANNEL_INPUT_EXCLUSIVE_REQUIRED`
- `CHANNEL_INVALID_POLYGON`
- `CHANNEL_INVALID_TILES`
- `CHANNEL_TILE_NORMALIZATION_FAILED`
- `CHANNEL_TILE_MATERIALIZATION_LIMIT_EXCEEDED`
- `CHANNEL_NO_TILES`
- `CHANNEL_TILE_LIMIT_EXCEEDED`
- `CHANNEL_ACTIVE_LIMIT_EXCEEDED`
- `CHANNEL_HOURLY_LIMIT_EXCEEDED`

## Tokens

### `POST /token`

Headers:

- `x-api-key`: required when `TOKEN_AUTH_REQUIRED=true`

Body:

```json
{"channelId":"abc123","tenantId":"acme","ttlSec":300}
```

Success:

```json
{"token":"payload.signature","tokenType":"Bearer","ttlSec":300,"expiresAt":"2026-06-05T00:05:00.000Z","channelId":"abc123","tenantId":"acme"}
```

Errors:

- `VALIDATION_ERROR`
- `TOKEN_API_KEY_MISSING`
- `TOKEN_API_KEY_INVALID`
- `TOKEN_CHANNEL_REQUIRED`
- `TOKEN_CHANNEL_NOT_FOUND`
- `TOKEN_TENANT_INVALID`
- `TOKEN_TENANT_MISMATCH`
- `TOKEN_RATE_LIMIT_EXCEEDED`

## Streaming

### `GET /stream`

Query params:

- `channelId`: required
- `offset`: optional, defaults to `0-0`
- `cursorId`: optional opaque client cursor; resumes each channel tile from its
  last successfully written frame when reused
- `includeAttrs`: optional, `true`/`1` or `false`/`0`, defaults to true

Offsets:

- `0-0`: replay retained history, then continue live
- `$`: live only
- `<ms>-<seq>`: resume from Redis Stream ID

Header:

- `Authorization: Bearer <token>`: required when `STREAM_AUTH_REQUIRED=true`

Ready event:

```text
event: ready
data: {"channelId":"abc123","mode":"event"}
```

Raw event frame:

```json
{"type":"event","offset":"1738692767711-0","tile":"872a1072cffffff","ts":"2026-06-05T00:00:00.000Z","id":"asset-1","loc":[-73.98,40.74],"attrs":{}}
```

Aggregate frame:

```json
{"type":"aggregate","op":"increment","offset":"1738692767711-0","tile":"872a1072cffffff","ts":"2026-06-05T00:00:00.000Z","windowStart":"2026-06-05T00:00:00.000Z","windowEnd":"2026-06-05T00:00:05.000Z","loc":[-73.98,40.74],"count":42,"attrs":{"avgSpeed":27.5}}
```

Aggregate mode is selected when channel `res <= STREAM_AGGREGATE_MAX_RES`.
Aggregate frames are increments grouped into stable event-time windows.

Errors:

- `VALIDATION_ERROR`
- `STREAM_TOKEN_MISSING`
- `STREAM_TOKEN_INVALID`
- `STREAM_TOKEN_EXPIRED`
- `STREAM_TOKEN_CHANNEL_MISMATCH`
- `STREAM_TOKEN_TENANT_MISMATCH`
- `STREAM_CHANNEL_NOT_FOUND`
- `STREAM_CHANNEL_NO_TILES`
- `STREAM_TENANT_SUBSCRIBER_LIMIT_EXCEEDED`
- `STREAM_CHANNEL_SUBSCRIBER_LIMIT_EXCEEDED`
- `CHANNEL_TILE_LIMIT_EXCEEDED`

## Tenant Storage

- Event streams: `stream:tenant:<tenantId>:tile:<h3>`
- Channel records: `chan:<channelId>`
- Ingest idempotency: `idem:ingest:<tenantId>:<idempotencyKey>`

## Key Config

- `INGEST_MAX_BODY_BYTES`, `INGEST_MAX_EVENTS_PER_REQUEST`, `INGEST_IDEMPOTENCY_TTL_SEC`
- `INGEST_RATE_LIMIT_EVENTS_PER_SEC`
- `TOKEN_MINT_RATE_LIMIT_PER_MIN`
- `CHANNEL_TTL_SEC`, `CHANNEL_TTL_MIN_SEC`, `CHANNEL_TTL_MAX_SEC`
- `MAX_TILES_PER_CHANNEL`, `MAX_CHANNEL_TILE_MATERIALIZATION`
- `MAX_CHANNELS_PER_TENANT_HOUR`, `MAX_CHANNELS_PER_TENANT_ACTIVE`
- `STREAM_READ_COUNT`, `STREAM_BLOCK_MS`, `STREAM_AGGREGATE_MAX_RES`, `STREAM_AGGREGATE_WINDOW_MS`
- `STREAM_THIN_MAX_EVENTS_PER_TILE_READ`, `STREAM_MAX_PENDING_FRAMES`, `STREAM_MAX_PENDING_BYTES`
- `MAX_STREAM_SUBSCRIBERS_PER_TENANT`, `MAX_STREAM_SUBSCRIBERS_PER_CHANNEL`
- `STREAM_SUBSCRIBER_LEASE_SEC`, `STREAM_CURSOR_TTL_SEC`
- `METRICS_AUTH_REQUIRED`, `METRICS_AUTH_TOKEN`
- `METRICS_RESET_ENABLED`, `METRICS_RESET_TOKEN`
