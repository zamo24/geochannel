import assert from "node:assert/strict";
import test from "node:test";
import { IDEMPOTENCY_KEY_MAX_LENGTH, IDEMPOTENCY_KEY_PATTERN } from "@geochannel/contracts";
import { hashRequestBody, isValidIdempotencyKey, normalizeIdempotencyKey } from "./idempotency.js";

test("normalizeIdempotencyKey trims and rejects empty values", () => {
  assert.equal(normalizeIdempotencyKey("  abc-123  "), "abc-123");
  assert.equal(normalizeIdempotencyKey("   "), null);
  assert.equal(normalizeIdempotencyKey(undefined), null);
});

test("isValidIdempotencyKey enforces shared pattern and length", () => {
  const regex = new RegExp(IDEMPOTENCY_KEY_PATTERN);
  assert.equal(regex.test("idem.key:1"), true);
  assert.equal(isValidIdempotencyKey("idem.key:1"), true);
  assert.equal(isValidIdempotencyKey("bad key"), false);
  assert.equal(isValidIdempotencyKey("x".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)), false);
});

test("hashRequestBody is deterministic for equal payloads", () => {
  const payload = [{ id: "asset-1", ts: "2026-01-01T00:00:00.000Z", loc: [1, 2] }];
  assert.equal(hashRequestBody(payload), hashRequestBody(payload));
});
