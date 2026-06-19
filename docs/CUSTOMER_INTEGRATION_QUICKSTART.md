# Customer Integration Quickstart

This guide connects one live-map workflow to GeoChannel without exposing
tenant or ingest API keys in a browser.

Target outcome: ingest the first location event and receive it in a
viewport-scoped browser stream within one hour.

## Integration Shape

```text
Producer or trusted bridge
  -> POST /ingest/events with ingest API key

Authenticated browser
  -> customer backend or token broker
  -> POST /channels and POST /token with tenant API key
  -> browser receives channelId and short-lived stream token
  -> browser connects to GET /stream with bearer token
```

Use the reference implementation in
[`../examples/token-broker/`](../examples/token-broker/) to evaluate the
trusted channel and token flow. In production, mount that operation behind the
customer application's existing authenticated user session.

The token broker is example integration code, not a GeoChannel service that
customers are expected to deploy unchanged. Its purpose is to show how a
customer's trusted backend should call GeoChannel's `/channels` and `/token`
endpoints while keeping the tenant API key out of the browser. Customers should
adapt the operation into their existing backend and apply their own user
authorization, spatial-access rules, rate limits, and audit logging.

## Prerequisites

Configure the following for your deployment:

- `GEOCHANNEL_API_URL`
- `TENANT_ID`
- `INGEST_API_KEY`
- `TENANT_API_KEY`
- Event-rate, viewer, payload, and replay limits

Keep both API keys in trusted server-side secret storage. Never place them in a
browser bundle, mobile application, source repository, or URL.

## 1. Verify Service Health

```bash
curl -fsS "$GEOCHANNEL_API_URL/health/redis"
```

Expected response:

```json
{"status":"ok","ping":"PONG"}
```

## 2. Ingest a Location Event

GeoChannel accepts batches of normalized location events:

```bash
EVENT_ID="quickstart-$(date +%s)"
EVENT_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -fsS "$GEOCHANNEL_API_URL/ingest/events" \
  -H "content-type: application/json" \
  -H "x-api-key: $INGEST_API_KEY" \
  -H "idempotency-key: $EVENT_ID" \
  -d '[{
    "id": "'"$EVENT_ID"'",
    "ts": "'"$EVENT_TS"'",
    "loc": [-73.9857, 40.7484],
    "attrs": {"speed": 24}
  }]'
```

Required event fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable asset or event identifier |
| `ts` | ISO-8601 event timestamp |
| `loc` | `[longitude, latitude]` |
| `attrs` | Optional JSON attributes |

Use an idempotency key when retrying a batch. Reusing the same key with a
different payload is rejected.

## 3. Start the Trusted Token Broker

For evaluation, configure the reference broker:

```bash
export GEOCHANNEL_API_URL="https://api.example.com"
export GEOCHANNEL_TENANT_ID="$TENANT_ID"
export GEOCHANNEL_TENANT_API_KEY="$TENANT_API_KEY"
export BROKER_ACCESS_TOKEN="replace-with-a-reference-access-token"

npm --prefix examples/token-broker start
```

The reference bearer check is suitable for local and server-to-server
evaluation. Do not embed `BROKER_ACCESS_TOKEN` in a public browser. In the
customer application, replace it with the application's existing authenticated
session and authorization rules.

## 4. Create a Browser-Safe Channel Session

Create a short-lived channel and stream token through the trusted broker:

```bash
curl -fsS http://localhost:8090/channel-session \
  -H "authorization: Bearer $BROKER_ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "polygon": [
      [40.72, -74.01],
      [40.72, -73.95],
      [40.78, -73.95],
      [40.78, -74.01],
      [40.72, -74.01]
    ],
    "res": 8
  }'
```

Example response:

```json
{
  "channelId": "abc123",
  "tenantId": "acme",
  "tilesCount": 128,
  "res": 8,
  "token": "short-lived-stream-token",
  "tokenType": "Bearer",
  "expiresAt": "2026-06-12T18:05:00.000Z",
  "ttlSec": 300
}
```

The response is safe to return to an authorized browser because it does not
contain the tenant API key.

## 5. Subscribe from the Browser

Use fetch-based SSE because the native `EventSource` API cannot attach a bearer
token:

```js
import { subscribeChannelStream } from "@geochannel/client";

const API_URL = "https://api.example.com";
const session = await getChannelSessionFromYourAuthenticatedBackend();

const stream = subscribeChannelStream(
  (path) => new URL(path, API_URL).toString(),
  {
    channelId: session.channelId,
    offset: "0-0",
    cursorId: crypto.randomUUID(),
    headers: {
      authorization: `Bearer ${session.token}`
    },
    onReady(payload) {
      console.log("GeoChannel stream ready", payload);
    },
    onMessage(frame) {
      if (frame.type === "event") {
        updateMapAsset(frame.id, frame.loc, frame.attrs);
      } else if (frame.type === "aggregate") {
        updateMapAggregate(frame.tile, frame.loc, frame.count, frame.attrs);
      }
    },
    onError(error) {
      console.error("GeoChannel stream failed", error);
      // Request a fresh channel session before reconnecting after expiration.
    }
  }
);

// Close the stream when the map view is replaced or the page unmounts.
stream.close();
```

Offsets:

- `0-0`: replay retained events, then continue live.
- `$`: receive only events added after connection.
- `<milliseconds>-<sequence>`: resume from a known Redis Stream offset.

Provide a stable `cursorId` for reconnects. GeoChannel stores a separate offset
for every tile in the channel and resumes after the last successfully written
frame.

## 6. Handle Viewport Changes

When the map finishes moving:

1. Debounce the map `moveend` event.
2. Compute the new viewport polygon or H3 tile set.
3. Request a new channel session from the authenticated customer backend.
4. Connect the replacement stream.
5. Close the previous stream.

Do not create a new channel for every animation frame. Respect the configured
active and hourly channel limits.

## 7. Production Proxy Requirements

The proxy or load balancer in front of GeoChannel must:

- Support long-lived HTTP responses.
- Disable response buffering for `/stream`.
- Preserve `Authorization` headers.
- Allow the expected idle duration between events.
- Avoid compressing or transforming SSE responses unexpectedly.
- Return `text/event-stream` responses immediately.

GeoChannel sends keepalive comments every 15 seconds and sets
`X-Accel-Buffering: no`, but the deployment proxy must still be configured
correctly.

## 8. Verify the Complete Flow

The integration is ready for controlled traffic when:

- [ ] Health and Redis health checks pass.
- [ ] A trusted producer can ingest an event.
- [ ] An unauthorized ingest request is rejected.
- [ ] An authenticated customer backend can create a channel session.
- [ ] No tenant or ingest API key appears in browser requests or bundles.
- [ ] The browser receives replay and live events.
- [ ] The browser reconnects using a cursor without duplicating accepted
      frames.
- [ ] Zooming out switches to aggregate frames.
- [ ] Dashboards show ingest, stream, latency, reconnect, and drop
      signals.
- [ ] Support can correlate a browser-visible `x-request-id` with backend audit
      logs.

## Common Integration Failures

| Symptom | Check |
| --- | --- |
| `401` from ingest | Ingest key and tenant mapping |
| `401` from channel or token request | Tenant key is present only in trusted backend |
| `401` from stream | Stream token is present and unexpired |
| `404 STREAM_CHANNEL_NOT_FOUND` | Channel TTL has expired |
| Reconnect loop | Token expiry, channel TTL, proxy buffering, and CORS |
| Missing old events | Replay retention and requested offset |
| Too many channel errors | Viewport debounce and configured channel quotas |

## Deployment Inputs

Before integration begins, the deployment owner should provide:

- API base URL and tenant ID.
- Keys through an approved secret-sharing channel.
- Fixed capacity and retention limits.
- Support contact and escalation path.
- Planned maintenance and rollback expectations.
- Acceptance criteria and review schedule.
