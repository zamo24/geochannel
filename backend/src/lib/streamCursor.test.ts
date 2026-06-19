import assert from "node:assert/strict";
import test from "node:test";
import { StreamCursorWriter, streamCursorKey } from "./streamCursor.js";

test("streamCursorKey namespaces resumable cursors by tenant", () => {
  assert.equal(streamCursorKey("acme", "browser-1"), "cursor:tenant:acme:browser-1");
});

test("StreamCursorWriter serializes cursor updates in offset order", async () => {
  const writes: Array<Record<string, string>> = [];
  let releaseFirst: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let executions = 0;
  const redis = {
    pipeline() {
      let values: Record<string, string> = {};
      return {
        hset(_key: string, input: Record<string, string>) {
          values = input;
          return this;
        },
        expire() {
          return this;
        },
        async exec() {
          executions += 1;
          if (executions === 1) await firstWrite;
          writes.push(values);
          return [[null, 1], [null, 1]];
        }
      };
    }
  } as never;

  const writer = new StreamCursorWriter(redis, "cursor:tenant:acme:browser-1", 60);
  writer.mark("tile-1", "1-0");
  const first = writer.flush();
  await Promise.resolve();
  writer.mark("tile-1", "2-0");
  const second = writer.flush();
  releaseFirst?.();
  await Promise.all([first, second]);

  assert.deepEqual(writes, [{ "tile-1": "1-0" }, { "tile-1": "2-0" }]);
});

test("StreamCursorWriter does not regress a pending tile offset", async () => {
  let values: Record<string, string> = {};
  const redis = {
    pipeline() {
      return {
        hset(_key: string, input: Record<string, string>) {
          values = input;
          return this;
        },
        expire() {
          return this;
        },
        async exec() {
          return [[null, 1], [null, 1]];
        }
      };
    }
  } as never;

  const writer = new StreamCursorWriter(redis, "cursor:tenant:acme:browser-1", 60);
  writer.mark("tile-1", "10-0");
  writer.mark("tile-1", "9-0");
  await writer.flush();

  assert.deepEqual(values, { "tile-1": "10-0" });
});
