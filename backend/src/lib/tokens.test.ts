import assert from "node:assert/strict";
import test from "node:test";
import { buildStreamTokenWithSecret, verifyStreamTokenWithSecrets } from "./tokens.js";

const futureExp = Math.floor(Date.now() / 1000) + 300;

test("verifyStreamTokenWithSecrets accepts a previous rotation secret", () => {
  const token = buildStreamTokenWithSecret(
    {
      tenantId: "acme",
      channelId: "chan-1",
      exp: futureExp
    },
    "old-secret"
  );

  const result = verifyStreamTokenWithSecrets(token, ["new-secret", "old-secret"]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.tenantId, "acme");
    assert.equal(result.payload.channelId, "chan-1");
  }
});

test("verifyStreamTokenWithSecrets rejects unconfigured signing secrets", () => {
  const token = buildStreamTokenWithSecret(
    {
      tenantId: "acme",
      channelId: "chan-1",
      exp: futureExp
    },
    "untrusted-secret"
  );

  const result = verifyStreamTokenWithSecrets(token, ["new-secret", "old-secret"]);

  assert.deepEqual(result, {
    ok: false,
    code: "STREAM_TOKEN_INVALID",
    message: "Invalid stream token signature."
  });
});
