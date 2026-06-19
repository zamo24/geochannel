import assert from "node:assert/strict";
import test from "node:test";
import { checkTokenMintRateLimit } from "./tokenMintRateLimit.js";

test("checkTokenMintRateLimit bypasses disabled limits", async () => {
  const result = await checkTokenMintRateLimit({ eval: async () => ["unexpected"] } as never, "acme", 1000, 0);
  assert.deepEqual(result, { allowed: true, current: 0 });
});

test("checkTokenMintRateLimit returns Redis admission result", async () => {
  const allowed = await checkTokenMintRateLimit({ eval: async () => [1, 4] } as never, "acme", 1000, 60);
  assert.deepEqual(allowed, { allowed: true, current: 4 });
  const rejected = await checkTokenMintRateLimit({ eval: async () => [0, 60] } as never, "acme", 1000, 60);
  assert.deepEqual(rejected, { allowed: false, current: 60 });
});
