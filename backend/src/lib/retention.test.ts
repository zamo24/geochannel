import assert from "node:assert/strict";
import test from "node:test";
import { buildStreamTrimArgs } from "./retention.js";

test("buildStreamTrimArgs uses a rolling minimum stream id when retention is configured", () => {
  assert.deepEqual(buildStreamTrimArgs(15 * 60 * 1000, 10000, 2_000_000), [
    "MINID",
    "~",
    "1100000-0"
  ]);
});

test("buildStreamTrimArgs falls back to bounded stream length when retention is disabled", () => {
  assert.deepEqual(buildStreamTrimArgs(0, 10000, 2_000_000), ["MAXLEN", "~", "10000"]);
});
