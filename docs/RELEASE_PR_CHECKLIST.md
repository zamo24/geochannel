# Release PR Checklist

Use this checklist for PRs that change backend behavior, web streaming, shared
contracts, deployment, or operational docs.

## PR Summary

- [ ] User-facing or operational impact is described
- [ ] API/config changes are listed
- [ ] Security implications are called out
- [ ] Verification commands and results are included
- [ ] Rollback plan is included

## Required Checks

- [ ] `npm --prefix backend run test:unit`
- [ ] `npm --prefix backend run build`
- [ ] `npm --prefix backend run check:structure`
- [ ] `npm --prefix web run test:unit`
- [ ] `npm --prefix web run build`
- [ ] `npm --prefix web run check:structure`

When backend/streaming behavior changed:

- [ ] `docker compose -f infra/docker-compose.yml up -d --build`
- [ ] `npm --prefix backend run test:smoke`
- [ ] `docker compose -f infra/docker-compose.yml down`

When performance-sensitive paths changed:

- [ ] `npm --prefix backend run bench:limits:multi`
- [ ] Perf artifacts or summary are attached
- [ ] Worst stable capacity and drop rate are noted

## Documentation

- [ ] Version impact is classified using [VERSIONING.md](VERSIONING.md)
- [ ] Release notes or migration guidance are included when required
- [ ] [API.md](API.md) updated for endpoint, payload, error, or config changes
- [ ] [DEPLOYMENT.md](DEPLOYMENT.md) updated for env/config changes
- [ ] [RUNBOOK.md](RUNBOOK.md) updated for operational changes

## Security Review

- [ ] Auth-required paths stay protected
- [ ] Tenant identity is not trusted from untrusted client input in secured flows
- [ ] Secrets are not committed
- [ ] Token scope and expiry behavior are tested if touched
- [ ] Metrics reset is protected when enabled

## Release Decision

- [ ] Reviewer approved
- [ ] Deployment owner assigned
- [ ] Canary scope selected
- [ ] Rollback command prepared
- [ ] Post-deploy smoke check owner assigned
