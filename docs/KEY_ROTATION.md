# Key Rotation

Use this runbook to rotate tenant API keys and stream token signing secrets for
staging or externally accessible environments. Never commit raw secrets.

## API Keys

`INGEST_API_KEYS` and `TENANT_API_KEYS` accept comma-separated
`<tenant-id>:<api-key>` entries. The same tenant can appear more than once, so
old and new keys can overlap during rotation:

```text
TENANT_API_KEYS=acme:old-tenant-key,acme:new-tenant-key
INGEST_API_KEYS=acme:old-ingest-key,acme:new-ingest-key
```

Rotate ingest and tenant keys independently unless the same secret is
intentionally reused.

1. Generate the new key in the secret manager.
2. Deploy backend config with both old and new keys.
3. Verify the new key with the auth-enabled smoke flow.
4. Move producers or trusted tenant backends to the new key.
5. Watch auth failures, ingest rejects, stream reconnects, and support channels.
6. After the migration window, remove the old key from backend config.
7. Verify the old key now fails and the new key still succeeds.

## Stream Token Secret

`STREAM_TOKEN_SECRET` signs newly minted stream tokens.
`STREAM_TOKEN_PREVIOUS_SECRETS` accepts comma-separated old secrets that remain
valid for reconnecting clients during a rotation window.

Graceful rotation:

1. Generate a new `STREAM_TOKEN_SECRET`.
2. Move the current secret into `STREAM_TOKEN_PREVIOUS_SECRETS`.
3. Deploy all backend instances with the new current secret and previous secret.
4. Verify new tokens are minted and old unexpired tokens still connect.
5. Wait longer than `STREAM_TOKEN_TTL_MAX_SEC` and the expected client reconnect
   window.
6. Remove the old secret from `STREAM_TOKEN_PREVIOUS_SECRETS`.
7. Verify old tokens fail and newly minted tokens succeed.

Emergency revocation:

1. Set a new `STREAM_TOKEN_SECRET`.
2. Leave `STREAM_TOKEN_PREVIOUS_SECRETS` empty.
3. Deploy all backend instances.
4. Expect existing clients to reconnect and mint new tokens through the trusted
   token flow.

## Metrics Reset Token

`METRICS_RESET_TOKEN` has no overlapping previous-token support. Rotate it
during a low-risk window, update the benchmark/rehearsal secret, and verify
`POST /metrics/reset` succeeds with the new token and fails with the old token.

## Verification

Run after each rotation:

```bash
TEST_EXPECT_INGEST_AUTH=1 \
TEST_EXPECT_TENANT_AUTH=1 \
TEST_EXPECT_STREAM_AUTH=1 \
TEST_INGEST_API_KEY=<new-ingest-key> \
TEST_TENANT_API_KEY=<new-tenant-key> \
npm --prefix backend run test:smoke
```

Then run a short stream check with a freshly minted token and confirm dashboards
show normal ingest, stream, latency, drop, and reconnect behavior.

## Metrics Authentication Token

`METRICS_AUTH_TOKEN` protects `/metrics`, `/metrics/summary`, and
`/metrics/reset` when `METRICS_AUTH_REQUIRED=true`.

1. Generate a new token in the secret manager.
2. Update the backend and monitoring scraper secret together.
3. Deploy and confirm Prometheus reports the backend target as healthy.
4. Verify the old token fails and the new token succeeds.

There is no overlapping previous-token support. Rotate during a monitored
maintenance window.
