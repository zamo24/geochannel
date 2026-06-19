import assert from "node:assert/strict";
import test from "node:test";
import {
  isApiErrorPayload,
  isStreamAggregateFrame,
  isStreamEventFrame,
  isStreamFrame,
  STREAM_FRAME_TYPE_AGGREGATE,
  STREAM_CURSOR_ID_PATTERN,
  STREAM_OFFSET_LIVE,
  STREAM_OFFSET_PATTERN,
  STREAM_OFFSET_REPLAY_START
} from "@geochannel/contracts";

test("stream offset pattern accepts replay start and live markers", () => {
  const regex = new RegExp(STREAM_OFFSET_PATTERN);
  assert.equal(regex.test(STREAM_OFFSET_REPLAY_START), true);
  assert.equal(regex.test(STREAM_OFFSET_LIVE), true);
  assert.equal(regex.test("invalid-offset"), false);
});

test("stream cursor pattern accepts opaque browser cursor ids", () => {
  const regex = new RegExp(STREAM_CURSOR_ID_PATTERN);
  assert.equal(regex.test("client_cursor-123"), true);
  assert.equal(regex.test("bad cursor"), false);
});

test("isApiErrorPayload validates typed error shape", () => {
  assert.equal(isApiErrorPayload({ error: { code: "X", message: "Bad request" } }), true);
  assert.equal(isApiErrorPayload({ error: { code: "X" } }), false);
});

test("isStreamEventFrame validates event frame payload", () => {
  const valid = {
    type: "event",
    offset: "10-0",
    tile: "892a100d2d7ffff",
    ts: "2026-02-12T00:00:00.000Z",
    id: "asset-1",
    loc: [-73.9857, 40.7484],
    attrs: { speed: 22 }
  };
  assert.equal(isStreamEventFrame(valid), true);
  assert.equal(isStreamEventFrame({ ...valid, loc: ["bad", 1] }), false);
  assert.equal(isStreamEventFrame({ ...valid, type: "aggregate" }), false);
});

test("isStreamAggregateFrame validates aggregate payload", () => {
  const valid = {
    type: STREAM_FRAME_TYPE_AGGREGATE,
    offset: "11-0",
    tile: "892a100d2d7ffff",
    ts: "2026-02-12T00:00:00.000Z",
    loc: [-73.99, 40.74],
    count: 8,
    op: "increment",
    windowStart: "2026-02-12T00:00:00.000Z",
    windowEnd: "2026-02-12T00:00:05.000Z",
    attrs: { avgSpeed: 27.5 }
  };
  assert.equal(isStreamAggregateFrame(valid), true);
  assert.equal(isStreamAggregateFrame({ ...valid, count: 0 }), false);
  assert.equal(isStreamAggregateFrame({ ...valid, type: "event" }), false);
  assert.equal(isStreamFrame(valid), true);
});
