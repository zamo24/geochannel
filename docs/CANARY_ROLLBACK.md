# Canary And Rollback

Use this to release backend or streaming changes safely.

## Preconditions

- Build and tests passed.
- Staging smoke flow passed:
  - `POST /channels`
  - `POST /token`
  - `POST /ingest/events`
  - `GET /stream?offset=0-0`
- Metrics dashboard is available.
- Previous backend revision can be restored quickly.
- Rollback owner is assigned.

## Canary Scope

- One tenant, or no more than 5% of deployment traffic
- Minimum observation window: 10-15 minutes
- Previous revision remains warm if deployment platform supports it

## Procedure

1. Deploy the new revision to the canary slice.
2. Run a synthetic ingest/channel/stream flow.
3. Confirm `/metrics/summary` updates for ingest, stream, latency, drops, and subscribers.
4. Observe canary metrics for at least 10 minutes.
5. Compare against the previous baseline.
6. Promote only if no rollback trigger fires.

## Rollback Triggers

Rollback if any condition persists for more than 3 minutes:

- `/health` or `/health/redis` fails repeatedly
- Stream p95 latency increases by more than 35% versus baseline
- Backpressure drop rate exceeds 1%
- Stream reconnect/auth failures spike and do not recover
- Ingest rejection or 5xx rate materially increases
- Redis or backend resource saturation threatens broader traffic

## Rollback Steps

1. Route canary traffic back to the previous revision.
2. Verify previous revision health.
3. Confirm subscriber count stabilizes.
4. Confirm drop counters flatten and latency returns toward baseline.
5. Capture an incident note:
   - release version
   - trigger metric
   - rollback timestamp
   - suspected cause
   - follow-up owner

## Promote Criteria

- No rollback trigger fired during the observation window
- Ingest/channel/stream smoke checks still pass
- p95/p99 latency is within agreed baseline envelope
- Drop rate is within agreed threshold
- No new auth or reconnect regression is observed
