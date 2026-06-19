import assert from "node:assert/strict";
import test from "node:test";
import { SseFramePump } from "./framePump.js";

function frame(id: string) {
  return {
    payload: `data: ${id}\n\n`,
    mode: "event" as const,
    tsMs: Date.now()
  };
}

test("SseFramePump drops oldest pending frame when queue is full", () => {
  const sent: string[] = [];
  let writes = 0;
  const dropped: string[] = [];

  const pump = new SseFramePump(
    (chunk) => {
      writes += 1;
      sent.push(chunk);
      return writes !== 1;
    },
    2,
    {
      onDrop: (entry) => dropped.push(entry.payload)
    }
  );

  pump.enqueue(frame("a"));
  pump.enqueue(frame("b"));
  pump.enqueue(frame("c"));
  pump.enqueue(frame("d"));
  assert.equal(dropped.length, 1);
  assert.match(dropped[0], /b/);
  assert.equal(pump.pendingCount(), 2);

  pump.onDrain();
  assert.equal(pump.pendingCount(), 0);
  assert.deepEqual(
    sent.map((item) => item.trim()),
    ["data: a", "data: c", "data: d"]
  );
});

test("SseFramePump treats a false write result as accepted and does not resend it after drain", () => {
  const sent: string[] = [];
  let first = true;
  let backpressureSignals = 0;
  const pump = new SseFramePump(
    (chunk) => {
      sent.push(chunk);
      if (first) {
        first = false;
        return false;
      }
      return true;
    },
    10,
    {
      onBackpressure: () => {
        backpressureSignals += 1;
      }
    }
  );

  pump.enqueue(frame("x"));
  assert.equal(pump.isWaitingDrain(), true);
  assert.equal(backpressureSignals, 1);
  assert.equal(pump.pendingCount(), 0);

  pump.onDrain();
  assert.equal(pump.isWaitingDrain(), false);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /x/);
});

test("SseFramePump enforces pending byte budget", () => {
  const dropped: string[] = [];
  const sent: string[] = [];
  let writes = 0;

  const pump = new SseFramePump(
    (chunk) => {
      writes += 1;
      sent.push(chunk);
      return writes !== 1;
    },
    10,
    {
      onDrop: (entry) => dropped.push(entry.payload)
    },
    {
      maxPendingBytes: 24
    }
  );

  pump.enqueue(frame("1234567"));
  pump.enqueue(frame("ABCDEFG"));
  pump.enqueue(frame("7654321"));

  assert.equal(dropped.length, 1);
  assert.match(dropped[0], /ABCDEFG/);
  assert.equal(pump.pendingCount(), 1);
  assert.equal(pump.isWaitingDrain(), true);

  pump.onDrain();
  assert.equal(sent.length, 2);
  assert.match(sent[0], /1234567/);
  assert.match(sent[1], /7654321/);
  assert.equal(pump.pendingBytes(), 0);
});
