import assert from "node:assert/strict";
import test from "node:test";
import { buildEventFrameBatches } from "./eventFrameBatch.js";

test("buildEventFrameBatches batches payloads and carries the latest tile cursor", () => {
  const result = buildEventFrameBatches(
    "stream:tenant:acme:tile:tile-1",
    [
      ["1000-0", ["id", "a", "ts", "2026-06-06T00:00:00.000Z", "lon", "1", "lat", "2", "cell", "tile-1"]],
      ["1001-0", ["id", "b", "ts", "2026-06-06T00:00:01.000Z", "lon", "2", "lat", "3", "cell", "tile-1"]]
    ],
    { includeAttrs: false, maxFrames: 10, maxBytes: 10000 }
  );
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].frameCount, 2);
  assert.equal(result.frames[0].cursorTile, "tile-1");
  assert.equal(result.frames[0].cursorOffset, "1001-0");
});

test("buildEventFrameBatches counts invalid coordinate entries", () => {
  const result = buildEventFrameBatches(
    "stream:tenant:acme:tile:tile-1",
    [["1000-0", ["id", "a", "lon", "bad", "lat", "2", "cell", "tile-1"]]],
    { includeAttrs: false, maxFrames: 10, maxBytes: 10000 }
  );
  assert.equal(result.frames.length, 0);
  assert.equal(result.invalidCount, 1);
});
