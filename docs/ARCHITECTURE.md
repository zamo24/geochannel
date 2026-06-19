# GeoChannel Architecture

GeoChannel is split into backend services, a demo web client, shared contracts,
local infrastructure, and documentation.

## Repo Layout

```text
backend/             Fastify API, Redis stream orchestration, metrics, benchmarks
web/                 Vite + React + MapLibre demo client
packages/contracts/  Shared types, constants, and runtime guards
packages/client/     Reusable channel, token, and fetch-SSE client helpers
infra/               Local Docker Compose stack
docs/                API, architecture, deployment, and operations docs
scripts/             Repo structure guardrails
```

## Runtime Data Flow

```text
Producers / demo generator
  -> POST /ingest/events
  -> validate event shape and tenant identity
  -> compute H3 ingest cell and stream-resolution parents
  -> XADD into Redis Streams per tenant/tile/resolution

Map clients
  -> compute viewport polygon or compacted H3 cells
  -> POST /channels
  -> receive channelId
  -> optionally POST /token
  -> GET /stream?channelId=...&offset=...
  -> render event or aggregate frames
```

## Storage Model

- Event streams: `stream:tenant:<tenantId>:tile:<h3>`
- Channel records: `chan:<channelId>`
- Active channel limit sets: `tenant:<tenantId>:channels:active`
- Hourly channel limit sets: `tenant:<tenantId>:channels:hourly`
- Ingest idempotency records: `idem:ingest:<tenantId>:<idempotencyKey>`
- Stream cursors: `cursor:tenant:<tenantId>:<cursorId>`
- Subscriber lease sets: `subscribers:tenant:*`, `subscribers:channel:*`

Channel storage and active/hourly quota admission run in one Redis Lua script so
concurrent channel requests cannot exceed configured limits through a
check-then-write race.

## Backend Boundaries

- `routes/`: Fastify route handlers and response schemas
- `lib/`: shared backend logic and pure helpers
- `http/`: transport-level helpers such as typed API errors
- `config.ts`: environment parsing and runtime defaults
- `app.ts`: dependency construction and route registration

Backend source must not import from `web/**`.

## Web Boundaries

- `features/channels/`: viewport channel creation and stream lifecycle
- `features/demo-generator/`: synthetic event generation
- `features/map/`: MapLibre setup and source/layer wiring
- `features/metrics/`: metrics polling, charts, and dashboard model
- `features/stream/`: frame-to-GeoJSON storage and pruning
- `features/ui/`: presentational controls

Web source must not import from `backend/**`.

## Shared Contracts

Cross-app payload shapes, regex patterns, stream constants, and runtime guards
belong in `@geochannel/contracts`.

## Guardrails

```bash
npm --prefix backend run check:structure
npm --prefix web run check:structure
```

The guardrail script enforces import boundaries and keeps source files under the
current 450-line limit.
