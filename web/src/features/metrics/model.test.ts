import assert from "node:assert/strict";
import test from "node:test";
import { aggregateTenantMode, appendSummaryHistory, applyWindow, EMPTY_HISTORY, filterTenantMode, windowMsFor } from "./model";

test("appendSummaryHistory appends all expected metric points", () => {
  const next = appendSummaryHistory(
    EMPTY_HISTORY,
    {
      ingestRate1m: 12,
      streamRate1m: 25,
      subscribersCurrent: 3,
      latencyP95Ms: 45,
      ingestEventsTotal: 100,
      streamFramesTotal: 200,
      dropsBackpressureTotal: 2,
      dropsInvalidTotal: 1,
      backpressureSignalsTotal: 4
    },
    1000
  );

  assert.equal(next.ingestRate1m.length, 1);
  assert.equal(next.streamRate1m[0].value, 25);
  assert.equal(next.subscribersCurrent[0].value, 3);
  assert.equal(next.latencyP95Ms[0].value, 45);
});

test("filterTenantMode filters by tenant and mode", () => {
  const rows = [
    { tenantId: "a", mode: "event", streamFramesTotal: 10, subscribersCurrent: 1, dropsBackpressureTotal: 0, dropsInvalidTotal: 0, backpressureSignalsTotal: 0 },
    { tenantId: "a", mode: "aggregate", streamFramesTotal: 5, subscribersCurrent: 2, dropsBackpressureTotal: 0, dropsInvalidTotal: 0, backpressureSignalsTotal: 0 },
    { tenantId: "b", mode: "event", streamFramesTotal: 8, subscribersCurrent: 1, dropsBackpressureTotal: 1, dropsInvalidTotal: 0, backpressureSignalsTotal: 1 }
  ];

  assert.equal(filterTenantMode(rows, "all", "all").length, 3);
  assert.equal(filterTenantMode(rows, "a", "all").length, 2);
  assert.equal(filterTenantMode(rows, "a", "event").length, 1);
});

test("aggregateTenantMode totals selected rows", () => {
  const total = aggregateTenantMode([
    { tenantId: "a", mode: "event", streamFramesTotal: 10, subscribersCurrent: 1, dropsBackpressureTotal: 2, dropsInvalidTotal: 0, backpressureSignalsTotal: 1 },
    { tenantId: "a", mode: "aggregate", streamFramesTotal: 5, subscribersCurrent: 2, dropsBackpressureTotal: 1, dropsInvalidTotal: 3, backpressureSignalsTotal: 2 }
  ]);
  assert.equal(total.streamFramesTotal, 15);
  assert.equal(total.subscribersCurrent, 3);
  assert.equal(total.dropsBackpressureTotal, 3);
  assert.equal(total.dropsInvalidTotal, 3);
  assert.equal(total.backpressureSignalsTotal, 3);
});

test("applyWindow trims old points for configured windows", () => {
  const points = [
    { ts: 999, value: 1 },
    { ts: 59_000, value: 2 },
    { ts: 61_000, value: 3 }
  ];
  assert.equal(windowMsFor("1m"), 60_000);
  assert.equal(applyWindow(points, 61_000, "1m").length, 2);
  assert.equal(applyWindow(points, 61_000, "all").length, 3);
});
