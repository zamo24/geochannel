# GeoChannel Documentation

GeoChannel is an open-source backend and JavaScript SDK for replayable,
viewport-scoped geospatial streams. Producers publish location events once;
map clients create short-lived spatial channels and receive only the replay
and live updates relevant to their current viewport or area of interest.

!!! warning "Developer preview"

    GeoChannel is intended for local evaluation, integration development, and
    controlled deployments. Review the [deployment limitations](DEPLOYMENT.md)
    and [security guidance](SECURITY_DATA_HANDLING_FAQ.md) before exposing it
    to production traffic.

## Start Here

- [Customer integration quickstart](CUSTOMER_INTEGRATION_QUICKSTART.md) —
  connect ingest, trusted token minting, channels, and browser streaming.
- [API reference](API.md) — review endpoint contracts, authentication,
  payloads, stream frames, and errors.
- [Architecture](ARCHITECTURE.md) — understand service boundaries, storage,
  replay, and live delivery.
- [Deployment](DEPLOYMENT.md) — configure local and controlled environments.

## Quickstart

From the repository root, with Node.js 20+ and Docker with Docker Compose:

```bash
npm ci
docker compose -f infra/docker-compose.yml up -d --build
npm run dev:web
```

Open `http://localhost:5173` and enable event generation in the demo HUD. The
API is available at `http://localhost:8081`.

Stop the local stack with:

```bash
docker compose -f infra/docker-compose.yml down
```

## How GeoChannel Fits Together

```text
Location producers
  -> POST /ingest/events
  -> validate and index events by tenant + H3 cell
  -> Redis Streams

Map application
  -> POST /channels for a viewport or AOI
  -> POST /token from a trusted backend
  -> GET /stream?channelId=... over authenticated SSE
```

The backend handles tenant-aware ingest, spatial indexing, retention, replay,
and live Server-Sent Events. The JavaScript client helps applications create
channels, obtain short-lived stream credentials, subscribe, reconnect, and
change viewports.

## Documentation

| Area | Guides |
| --- | --- |
| Integration | [Quickstart](CUSTOMER_INTEGRATION_QUICKSTART.md) · [API reference](API.md) |
| Design | [Architecture](ARCHITECTURE.md) |
| Operations | [Deployment](DEPLOYMENT.md) · [Observability](OBSERVABILITY.md) · [Runbook](RUNBOOK.md) |
| Security | [Security and data handling](SECURITY_DATA_HANDLING_FAQ.md) · [Key rotation](KEY_ROTATION.md) |
| Releases | [Canary and rollback](CANARY_ROLLBACK.md) · [Pre-release checklist](PRE_RELEASE_CHECKLIST.md) |
| Service options | [Managed GeoChannel](MANAGED_SERVICE.md) |
| Project direction | [Roadmap](ROADMAP.md) |

Repository policies and community files remain on GitHub:
[contributing](https://github.com/zamo24/geochannel/blob/main/CONTRIBUTING.md),
[code of conduct](https://github.com/zamo24/geochannel/blob/main/CODE_OF_CONDUCT.md),
[license](https://github.com/zamo24/geochannel/blob/main/LICENSE), and
[trademarks](https://github.com/zamo24/geochannel/blob/main/TRADEMARKS.md).
