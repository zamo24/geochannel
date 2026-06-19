# GeoChannel Runbook

Use this for staging or self-hosted deployment incident response.

## Primary Signals

- `GET /health`
- `GET /health/redis`
- `GET /metrics`
- `GET /metrics/summary`
- Backend logs for audit events, stream errors, invalid channel records, auth
  failures, and Redis errors

## Key Metrics

Dashboard queries and starter Prometheus alerts are documented in
[OBSERVABILITY.md](OBSERVABILITY.md).

- `geochannel_ingest_requests_total`
- `geochannel_ingest_events_total`
- `geochannel_ingest_events_rejected_total`
- `geochannel_stream_subscribers_current`
- `geochannel_stream_frames_sent_total`
- `geochannel_stream_bytes_sent_total`
- `geochannel_stream_frames_dropped_backpressure_total`
- `geochannel_stream_frames_dropped_invalid_total`
- `geochannel_stream_backpressure_signals_total`
- `geochannel_stream_frame_latency_ms`

## Incident: Ingest Failures

Symptoms:

- 4xx/5xx responses on `/ingest/events`
- Flat or falling ingest event rate
- Rising rejected ingest events

Actions:

1. Check `INGEST_AUTH_REQUIRED` and tenant key configuration.
2. Verify payload size and event count against configured limits.
3. Check tenant ID format and `x-api-key` or `x-tenant-id` headers.
4. Confirm Redis health with `/health/redis`.
5. Inspect backend logs for validation, idempotency, or pressure-shed errors.
6. Roll back if failures started immediately after a release.

## Incident: Stream Reconnect Loops

Symptoms:

- Clients cycle through `connecting` and `reconnecting`
- `/stream` returns auth or channel errors
- Subscriber count churns rapidly

Actions:

1. Confirm channel records still exist and TTL is long enough.
2. If stream auth is enabled, mint a token and test one stream manually.
3. Verify `STREAM_TOKEN_SECRET` is consistent across backend instances.
4. Check token `tenantId` and `channelId` mismatch paths.
5. Check proxy/network buffering config for SSE pass-through.
6. Inspect client logs for channel creation or token request failures.

## Incident: Backpressure Drops

Symptoms:

- Rising `geochannel_stream_frames_dropped_backpressure_total`
- Rising `geochannel_stream_backpressure_signals_total`
- High pending frame/byte pressure in logs or metrics

Actions:

1. Identify affected tenant and stream mode labels.
2. Compare raw vs aggregate stream pressure.
3. Lower raw stream resolution or enable aggregate mode for broad views.
4. Tune `STREAM_MAX_PENDING_FRAMES` and `STREAM_MAX_PENDING_BYTES`.
5. Tune ingest pressure shedding if subscriber pressure is sustained.
6. Scale backend capacity if CPU or network is saturated.

## Incident: High Latency

Symptoms:

- p95/p99 regression in `geochannel_stream_frame_latency_ms`
- Stale map updates
- High Redis or backend resource use

Actions:

1. Check Redis latency and backend CPU/network saturation.
2. Inspect `STREAM_READ_COUNT`, `STREAM_BLOCK_MS`, and batch size config.
3. Compare event mode and aggregate mode latency.
4. Check for large channel tile counts.
5. Reproduce with `bench:limits` or `bench:limits:multi`.

## Recovery Checks

- [ ] `/health` and `/health/redis` are healthy
- [ ] `up{job="geochannel"}` is healthy for every backend target
- [ ] Manual channel create, token mint, ingest, and stream replay succeed
- [ ] Drop counters flatten or return to baseline
- [ ] p95/p99 latency trends back toward baseline
- [ ] Subscriber count stabilizes
- [ ] Staging smoke tests pass

For rollout decisions, see [CANARY_ROLLBACK.md](CANARY_ROLLBACK.md).
