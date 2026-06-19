import assert from "node:assert/strict";
import test from "node:test";
import * as h3 from "h3-js";
import {
  estimateNormalizedTileCountUpperBound,
  estimatePolygonCellMaterialization,
  normalizeTilesToRes
} from "./h3.js";

test("estimateNormalizedTileCountUpperBound bounds tile expansion before normalization", () => {
  const parent = h3.latLngToCell(40.7484, -73.9857, 6);
  const expected = h3.cellToChildrenSize(parent, 8);
  assert.equal(estimateNormalizedTileCountUpperBound([parent], 8), expected);
  const normalized = normalizeTilesToRes([parent], 8);
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(normalized.tiles.length, expected);
  }
});

test("estimatePolygonCellMaterialization grows with polygon area", () => {
  const small: [number, number][] = [
    [40.74, -73.99],
    [40.74, -73.98],
    [40.75, -73.98],
    [40.75, -73.99],
    [40.74, -73.99]
  ];
  const large: [number, number][] = [
    [40.5, -74.2],
    [40.5, -73.7],
    [41.0, -73.7],
    [41.0, -74.2],
    [40.5, -74.2]
  ];

  const smallEstimate = estimatePolygonCellMaterialization(small, 9);
  const largeEstimate = estimatePolygonCellMaterialization(large, 9);
  assert.ok(smallEstimate > 0);
  assert.ok(largeEstimate > smallEstimate);
});
