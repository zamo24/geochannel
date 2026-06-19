# GeoChannel

[![CI](https://github.com/zamo24/geochannel/actions/workflows/ci.yml/badge.svg)](https://github.com/zamo24/geochannel/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

GeoChannel is an open-source backend for replayable, viewport-scoped
geospatial streams. Producers send location events once; map clients create
short-lived spatial channels and receive only the replay and live updates
relevant to their current area.

The project is currently a **developer preview**. It is suitable for local
evaluation, integration development, and controlled deployments. Review the
[current limitations](docs/DEPLOYMENT.md) before exposing it to production
traffic.

## Why GeoChannel

- HTTP ingest for high-frequency location events
- H3-based viewport and area-of-interest channels
- Replay plus live updates over Server-Sent Events
- Short-lived browser stream tokens
- Low-zoom aggregation
- Tenant-aware auth, quotas, rate limits, and subscriber limits
- Redis-backed retention and resumable stream cursors
- Prometheus metrics, health checks, and operational runbooks
- JavaScript client helpers and shared runtime contracts

## Architecture

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the storage model and
module boundaries.

## Quickstart

Prerequisites:

- Node.js 20+
- Docker with Docker Compose

Install all workspace dependencies:

```bash
npm ci
```

Start Redis and the API:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Start the web demo:

```bash
npm run dev:web
```

Open `http://localhost:5173` and enable event generation in the demo HUD.

Local endpoints:

- API: `http://localhost:8081`
- Web demo: `http://localhost:5173`
- Redis: `localhost:6379`

Stop the local services with:

```bash
docker compose -f infra/docker-compose.yml down
```

## Development

```bash
npm test
npm run build
npm run check
```

Useful targeted commands:

```bash
npm run dev:backend
npm run test:smoke
npm run test:e2e
```

The E2E and smoke tests require Docker. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the complete contribution workflow.

## Packages

- `@geochannel/client`: channel creation, token minting, and fetch-based SSE
  helpers
- `@geochannel/contracts`: shared request, response, and stream frame contracts

The package source is maintained in this repository. npm publication starts
with the first tagged developer-preview release.

## Documentation

- [API reference](docs/API.md)
- [Customer integration quickstart](docs/CUSTOMER_INTEGRATION_QUICKSTART.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Observability](docs/OBSERVABILITY.md)
- [Security and data handling](docs/SECURITY_DATA_HANDLING_FAQ.md)
- [Operations runbook](docs/RUNBOOK.md)
- [Managed GeoChannel](docs/MANAGED_SERVICE.md)
- [Public roadmap](ROADMAP.md)

## Project Status and Support

GeoChannel does not currently provide a public uptime SLA, automated
multi-region operation, long-term historical storage, or a self-service cloud
control plane. Community support is provided through GitHub issues and
discussions on a best-effort basis.

Managed design-partner deployments are available for teams evaluating a
production workflow. See [Managed GeoChannel](docs/MANAGED_SERVICE.md).

## License

Licensed under the [Apache License 2.0](LICENSE). The GeoChannel name and logo
are governed separately by [TRADEMARKS.md](TRADEMARKS.md).
