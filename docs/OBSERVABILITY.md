# GeoChannel Observability

Use this guide to wire the backend into a monitoring stack and tune the
starter alert rules in [../infra/prometheus-alerts.yml](../infra/prometheus-alerts.yml).

## Metrics Endpoints

- `GET /metrics`: Prometheus text format
- `GET /metrics/summary`: JSON snapshot for dashboards and rehearsal scripts
- `POST /metrics/reset`: optional summary-window reset when `METRICS_RESET_ENABLED=true`

The Prometheus scrape target should read `/metrics` from every backend instance:

```yaml
scrape_configs:
  - job_name: geochannel
    metrics_path: /metrics
    authorization:
      credentials_file: /run/secrets/metrics_auth_token
    static_configs:
      - targets:
          - geochannel-api:8081
```

Externally accessible environments should set `METRICS_AUTH_REQUIRED=true`. Store the metrics
bearer token in the monitoring platform's secret store. Do not embed it in a
public dashboard or browser bundle.

If `/health` and `/health/redis` are monitored separately, use blackbox probes
or platform health checks. Prometheus `up{job="geochannel"}` only confirms the
metrics scrape target is reachable.

## Dashboard Panels

Create one dashboard with tenant and stream-mode filters where possible.

| Panel | Query |
| --- | --- |
| Target health | `up{job="geochannel"}` |
| Process uptime | `geochannel_process_uptime_seconds` |
| Ingest event rate | `sum by (tenantId) (rate(geochannel_ingest_events_total[5m]))` |
| Rejected ingest rate | `sum by (tenantId) (rate(geochannel_ingest_events_rejected_total[5m]))` |
| Ingest quota rejections | `sum by (tenantId) (rate(geochannel_ingest_rate_limit_rejections_total[5m]))` |
| Ingest request p95 | `histogram_quantile(0.95, sum by (le, tenantId) (rate(geochannel_ingest_request_duration_ms_bucket[5m])))` |
| Current subscribers | `sum by (tenantId, mode) (geochannel_stream_subscribers_current)` |
| Subscriber quota rejections | `sum by (tenantId, limit) (rate(geochannel_stream_subscriber_limit_rejections_total[5m]))` |
| Cursor resumes | `sum by (tenantId) (rate(geochannel_stream_cursor_resumes_total[5m]))` |
| Stream frame rate | `sum by (tenantId, mode) (rate(geochannel_stream_frames_sent_total[5m]))` |
| Stream bandwidth | `sum by (tenantId, mode) (rate(geochannel_stream_bytes_sent_total[5m])) * 8` |
| Stream latency p95 | `histogram_quantile(0.95, sum by (le, tenantId, mode) (rate(geochannel_stream_frame_latency_ms_bucket[5m])))` |
| Backpressure drops | `sum by (tenantId, mode) (rate(geochannel_stream_frames_dropped_backpressure_total[5m]))` |
| Invalid drops | `sum by (tenantId, mode) (rate(geochannel_stream_frames_dropped_invalid_total[5m]))` |
| Backpressure signals | `sum by (tenantId, mode) (rate(geochannel_stream_backpressure_signals_total[5m]))` |

The stream latency histogram is sampled. Lower `STREAM_LATENCY_SAMPLE_EVERY` if
the dashboard needs finer latency visibility at low traffic volume.

## Starter Alerts

Load [../infra/prometheus-alerts.yml](../infra/prometheus-alerts.yml) into the
target Prometheus or compatible alerting system, then tune thresholds after the
first representative `bench:limits:multi` and `bench:load-compare` runs.

Initial thresholds:

- Metrics target down for 2 minutes: critical
- Stream p95 latency above 1500 ms for 10 minutes: warning
- Backpressure drop ratio above 1% for 5 minutes: warning
- Invalid stream drops above zero for 10 minutes: warning
- Rejected ingest events above zero for 10 minutes: warning
- Subscription churn/reconnect spike for 10 minutes: warning

Treat these as release gates only after the benchmark baseline confirms they
match the deployment's expected traffic pattern.

## Tuning Notes

- Use tenant and mode labels to identify whether pressure is isolated to raw
  event streams or aggregate streams.
- Compare `geochannel_stream_bytes_sent_total` by mode to quantify aggregate
  bandwidth reduction.
- If latency is high without drops, inspect Redis latency, backend CPU/network,
  channel tile count, `STREAM_READ_COUNT`, and `STREAM_BLOCK_MS`.
- If drops or backpressure signals rise, tune `STREAM_MAX_PENDING_FRAMES`,
  `STREAM_MAX_PENDING_BYTES`, aggregate-mode usage, and ingest pressure shedding.
- If reconnect alerts fire, check channel TTL, stream token TTL/secret
  consistency, proxy SSE buffering, and client resubscribe behavior.
