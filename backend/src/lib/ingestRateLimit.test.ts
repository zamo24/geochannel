import assert from "node:assert/strict";
import test from "node:test";
import { checkIngestRateLimit } from "./ingestRateLimit.js";

test("checkIngestRateLimit bypasses disabled limits", async () => {
  const result = await checkIngestRateLimit({ eval: async () => ["unexpected"] } as never, "acme", 10, 1000, 0);
  assert.deepEqual(result, { allowed: true, current: 0 });
});

test("checkIngestRateLimit returns Redis admission result", async () => {
  const allowed = await checkIngestRateLimit({ eval: async () => [1, 15] } as never, "acme", 5, 1000, 20);
  assert.deepEqual(allowed, { allowed: true, current: 15 });
  const rejected = await checkIngestRateLimit({ eval: async () => [0, 20] } as never, "acme", 5, 1000, 20);
  assert.deepEqual(rejected, { allowed: false, current: 20 });
});
