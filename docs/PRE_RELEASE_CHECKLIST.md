# Pre-Release Checklist

Use this before merging or deploying changes that affect backend behavior, web
streaming, contracts, deployment, or operational docs.

## Build And Tests

- [ ] `npm --prefix backend run test:unit`
- [ ] `npm --prefix backend run build`
- [ ] `npm --prefix backend run check:structure`
- [ ] `npm --prefix web run test:unit`
- [ ] `npm --prefix web run test:e2e` against the secured E2E stack
- [ ] `npm --prefix web run build`
- [ ] `npm --prefix web run check:bundle`
- [ ] `npm --prefix web run check:structure`
- [ ] `npm --prefix backend run test:smoke` with backend and Redis running

## API And Contracts

- [ ] Release version follows [VERSIONING.md](VERSIONING.md)
- [ ] Public package versions and lockfiles use the coordinated release version
- [ ] Release notes describe user-facing changes and required migrations
- [ ] [API.md](API.md) matches implemented endpoint behavior
- [ ] Shared contracts in `packages/contracts/` are updated if frame or error shapes changed
- [ ] Error codes for changed failure paths are documented
- [ ] Backward-incompatible payload changes have a migration note

## Security

- [ ] Auth defaults are appropriate for the target environment
- [ ] Non-default `STREAM_TOKEN_SECRET` is configured outside local dev
- [ ] Ingest API keys are not committed
- [ ] Tenant and ingest API keys are not exposed in public browser deployments
- [ ] `/channels` and `/token` auth behavior is acceptable for the deployment target
- [ ] Metrics bearer auth is enabled for externally accessible environments
- [ ] Token mint rate limiting is configured for externally accessible environments
- [ ] Metrics reset token is configured if `/metrics/reset` is enabled
- [ ] Backend and web production dependency audits pass at high severity

## Performance And Metrics

- [ ] `npm --prefix backend run bench:limits:multi` run when stream or ingest performance changed
- [ ] Worst stable capacity is at or above target
- [ ] Worst observed drop rate is within threshold
- [ ] `/metrics/summary` reset semantics verified if changed
- [ ] Dashboard still shows ingest, stream, latency, subscriber, drop, and backpressure signals
- [ ] Web initial and async chunks remain within the checked bundle budgets

## Operations

- [ ] [RUNBOOK.md](RUNBOOK.md) is current
- [ ] [CANARY_ROLLBACK.md](CANARY_ROLLBACK.md) is current
- [ ] Rollback command and owner are known
- [ ] Release notes mention config or operational changes
