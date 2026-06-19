import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAggregateFrame,
  buildAggregateFrames,
  shouldAggregateByRes,
  thinEntries,
  type RedisStreamEntry
} from "./aggregation.js";

function makeEntry(id: string, lon: number, lat: number, speed: number): RedisStreamEntry {
  return [
    id,
    [
      "id",
      `asset-${id}`,
      "ts",
      "2026-02-12T00:00:00.000Z",
      "lon",
      String(lon),
      "lat",
      String(lat),
      "cell",
      "892a100d2d7ffff",
      "attrs",
      JSON.stringify({ speed })
    ]
  ];
}

test("shouldAggregateByRes switches on configured threshold", () => {
  assert.equal(shouldAggregateByRes(5, 6), true);
  assert.equal(shouldAggregateByRes(7, 6), false);
  assert.equal(shouldAggregateByRes(2, -1), false);
});

test("thinEntries keeps the newest entries", () => {
  const entries = [makeEntry("1-0", 1, 1, 10), makeEntry("2-0", 2, 2, 20), makeEntry("3-0", 3, 3, 30)];
  const thinned = thinEntries(entries, 2);
  assert.equal(thinned.length, 2);
  assert.equal(thinned[0][0], "2-0");
  assert.equal(thinned[1][0], "3-0");
});

test("buildAggregateFrame aggregates count/center/avgSpeed", () => {
  const frame = buildAggregateFrame("stream:tenant:acme:tile:892a100d2d7ffff", [
    makeEntry("1-0", -74, 40, 10),
    makeEntry("2-0", -73, 42, 30)
  ]);
  assert.ok(frame);
  assert.equal(frame?.type, "aggregate");
  assert.equal(frame?.count, 2);
  assert.deepEqual(frame?.loc, [-73.5, 41]);
  assert.equal((frame?.attrs as any)?.avgSpeed, 20);
  assert.equal(frame?.op, "increment");
});

test("buildAggregateFrames groups incremental aggregates into stable windows", () => {
  const frames = buildAggregateFrames("stream:tenant:acme:tile:892a100d2d7ffff", [
    makeEntry("1000-0", -74, 40, 10),
    makeEntry("2000-0", -73, 42, 30),
    [
      "6000-0",
      [
        "id",
        "asset-3",
        "ts",
        "2026-02-12T00:00:06.000Z",
        "lon",
        "-72",
        "lat",
        "41",
        "cell",
        "892a100d2d7ffff",
        "attrs",
        "{}"
      ]
    ]
  ], 5000);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].count, 2);
  assert.equal(frames[1].count, 1);
  assert.equal(Date.parse(frames[0].windowEnd ?? "") - Date.parse(frames[0].windowStart ?? ""), 5000);
});
