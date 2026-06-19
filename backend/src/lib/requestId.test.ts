import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRequestId, resolveRequestId } from "./requestId.js";

test("normalizeRequestId accepts safe caller-provided request ids", () => {
  assert.equal(normalizeRequestId(" pilot-request:123 "), "pilot-request:123");
  assert.equal(normalizeRequestId("contains spaces"), null);
  assert.equal(normalizeRequestId("x".repeat(129)), null);
});

test("resolveRequestId generates a request id when the supplied value is invalid", () => {
  assert.match(resolveRequestId(undefined), /^[0-9a-f-]{36}$/);
});
