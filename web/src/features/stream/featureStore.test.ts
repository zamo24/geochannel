import assert from "node:assert/strict";
import test from "node:test";
import { upsertAggregateFeature } from "./featureStore";
import type { FeatureCollectionLike } from "./types";

test("upsertAggregateFeature merges increments within the same stable window", () => {
  const collection: FeatureCollectionLike = { type: "FeatureCollection", features: [] };
  upsertAggregateFeature(collection, {
    type: "aggregate",
    op: "increment",
    offset: "1-0",
    tile: "tile-1",
    ts: "2026-06-06T00:00:01.000Z",
    loc: [0, 0],
    count: 2,
    windowStart: "2026-06-06T00:00:00.000Z",
    windowEnd: "2026-06-06T00:00:05.000Z"
  });
  upsertAggregateFeature(collection, {
    type: "aggregate",
    op: "increment",
    offset: "2-0",
    tile: "tile-1",
    ts: "2026-06-06T00:00:02.000Z",
    loc: [3, 3],
    count: 1,
    windowStart: "2026-06-06T00:00:00.000Z",
    windowEnd: "2026-06-06T00:00:05.000Z"
  });
  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].properties.count, 3);
  assert.deepEqual(collection.features[0].geometry.coordinates, [1, 1]);

  upsertAggregateFeature(collection, {
    type: "aggregate",
    op: "increment",
    offset: "2-0",
    tile: "tile-1",
    ts: "2026-06-06T00:00:02.000Z",
    loc: [3, 3],
    count: 1,
    windowStart: "2026-06-06T00:00:00.000Z",
    windowEnd: "2026-06-06T00:00:05.000Z"
  });
  assert.equal(collection.features[0].properties.count, 3);

  upsertAggregateFeature(collection, {
    type: "aggregate",
    op: "increment",
    offset: "3-0",
    tile: "tile-1",
    ts: "2026-06-05T23:59:57.000Z",
    loc: [9, 9],
    count: 10,
    windowStart: "2026-06-05T23:59:55.000Z",
    windowEnd: "2026-06-06T00:00:00.000Z"
  });
  assert.equal(collection.features[0].properties.count, 3);
});
