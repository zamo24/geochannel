# GeoChannel Security and Data-Handling FAQ

This document describes behavior implemented in the open-source repository. It
does not establish regulatory compliance, production readiness, or an uptime
SLA.

## What data does GeoChannel process?

GeoChannel processes event identifiers, timestamps, longitude and latitude,
optional JSON attributes, tenant identifiers, channel definitions, stream
cursors, operational metrics, and structured logs.

Only send fields required by the live-map workflow. Do not place credentials,
secrets, or unnecessary sensitive data in event attributes.

## How long are events retained?

Retention is deployment-configured through `STREAM_RETENTION_MS`. When rolling
retention is disabled, `STREAM_MAXLEN` provides an approximate length bound.
Redis Streams are intended for replay and reconnect, not guaranteed archival
or historical analytics.

Operators must select retention values appropriate for their data-handling
requirements and infrastructure capacity.

## Is GeoChannel a system of record?

No. Keep source events in a durable system when historical queries, guaranteed
reprocessing, regulatory retention, or archival are required.

## How is tenant access protected?

GeoChannel supports:

- Separate ingest and tenant API keys
- Tenant-derived access for channel creation and token minting
- Short-lived HMAC-signed stream tokens scoped to a tenant and channel
- Tenant-aware quotas and Redis namespaces
- Independent metrics authentication

Enable the relevant `*_AUTH_REQUIRED` settings for external deployments.
Public browsers must not receive ingest or tenant API keys. Channel creation
and token minting belong behind a trusted application backend.

## Can stream tokens be revoked individually?

No. Tokens expire after their configured TTL. Emergency revocation requires
rotating the stream signing secret and omitting previous secrets, which
invalidates existing tokens.

## How should credentials be stored and rotated?

The application reads credentials from environment variables. Deployed
environments should inject them from a secret manager and follow
[KEY_ROTATION.md](KEY_ROTATION.md).

Never commit active credentials or embed server-side keys in browser bundles.

## Is data encrypted?

GeoChannel does not encrypt individual event fields before writing them to
Redis. Operators are responsible for:

- TLS for client and service traffic
- Redis transport encryption and authentication
- Storage and backup encryption
- Network isolation
- Secret management

## Are metrics protected?

`/metrics`, `/metrics/summary`, and `/metrics/reset` require a bearer token
when `METRICS_AUTH_REQUIRED=true`. Health endpoints remain unauthenticated for
infrastructure probes and do not intentionally return tenant event data.

## What audit information is available?

Structured logs include channel creation, token minting, and stream
subscription events with tenant, channel, operation metadata, and request IDs.
These logs are operational records, not an immutable compliance audit ledger.

## What overload controls exist?

GeoChannel includes ingest rate limits, token-mint rate limits, active and
hourly channel limits, subscriber limits, pending-frame limits, and optional
pressure shedding. Operators must tune them using representative traffic.
They are not a complete denial-of-service protection layer.

## Can tenant data be deleted?

Channels and cursors expire automatically. Event data ages out according to
the configured stream retention policy. The project does not currently expose
a tenant purge API; operators requiring deletion guarantees must implement and
verify an operational deletion procedure.

## What backup and recovery guarantees exist?

The reference Compose configuration demonstrates Redis append-only
persistence. It does not provide managed backups, tested restore guarantees,
multi-region failover, or defined recovery objectives. Those responsibilities
belong to the deployment operator.

## Does GeoChannel provide an uptime SLA or compliance certification?

No. The open-source project does not provide an uptime SLA and does not claim
SOC 2, ISO 27001, HIPAA, GDPR, or other certification. Legal and operational
requirements must be evaluated for each deployment.

## What must be decided before external traffic?

- Infrastructure provider and region
- TLS, network, Redis, and storage controls
- Authentication and secret-rotation ownership
- Event retention and permitted attributes
- Backup, restore, and deletion procedures
- Monitoring, incident response, and rollback ownership
- Capacity limits validated in the target environment

See [DEPLOYMENT.md](DEPLOYMENT.md), [RUNBOOK.md](RUNBOOK.md), and
[CANARY_ROLLBACK.md](CANARY_ROLLBACK.md).
