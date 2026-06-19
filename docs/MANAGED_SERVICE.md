# Managed GeoChannel

GeoChannel's data plane and JavaScript packages are open source and can be
self-hosted. Teams that want help validating a production workflow can also
request a managed design-partner deployment.

## Initial Managed Deployment

The initial service is intentionally narrow:

- One isolated customer environment
- One tenant, region, and live-map workflow
- Authenticated ingest, channel creation, token minting, and streaming
- Managed Redis persistence
- TLS, secret management, monitoring, backups, and rollback procedures
- Integration assistance and weekly technical review
- Explicit traffic and retention limits
- No public uptime SLA during the design-partner stage

The purpose is to validate real event traffic, map behavior, operating cost,
and integration effort before introducing self-service cloud infrastructure.

## Requesting a Pilot

Start a GitHub Discussion or contact the maintainer through the
[zamo24 GitHub profile](https://github.com/zamo24) with:

- Your live-map use case
- Peak events per second
- Number of concurrent map viewers
- Replay and latency requirements
- Preferred deployment region
- Target evaluation timeline

Commercial terms and customer-specific deployment details are handled
privately and are not part of this open-source repository.
