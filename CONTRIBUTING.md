# Contributing to GeoChannel

GeoChannel welcomes bug reports, documentation improvements, focused feature
proposals, and code contributions.

## Before Starting

- Search existing issues and discussions.
- Open an issue before substantial API, storage, or architecture changes.
- Keep pull requests focused on one outcome.
- Do not include credentials, customer data, or private deployment details.

## Development

Prerequisites are Node.js 20+ and Docker with Docker Compose.

```bash
npm ci
npm run check
```

For integration checks:

```bash
docker compose -f infra/docker-compose.yml up -d --build
npm run test:smoke
npm run test:e2e
docker compose -f infra/docker-compose.yml down
```

Add or update tests for behavioral changes. Update API and deployment
documentation when public behavior or configuration changes.

## Developer Certificate of Origin

Contributions require sign-off under the
[Developer Certificate of Origin 1.1](https://developercertificate.org/).
Sign commits with:

```bash
git commit -s
```

The sign-off certifies that you have the right to submit the contribution under
the project's Apache-2.0 license. Pull requests containing unsigned commits
will not pass the DCO check.

## Pull Requests

- Explain the problem and user impact.
- Describe any public API or compatibility changes.
- List the checks you ran.
- Keep generated files and lockfiles synchronized.
- Follow the project [Code of Conduct](CODE_OF_CONDUCT.md).
