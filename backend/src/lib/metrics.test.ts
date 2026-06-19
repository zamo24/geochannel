import assert from "node:assert/strict";
import test from "node:test";
import { MetricsRegistry } from "./metrics.js";

test("metrics registry renders counters, gauges, and histograms", () => {
  const metrics = new MetricsRegistry();
  metrics.recordIngest("acme", 3, 1, 12);
  metrics.recordStreamSubscribe("acme", "event");
  for (let i = 0; i < 4; i += 1) {
    metrics.recordStreamFrameSent("acme", "event", 120, 35);
  }
  metrics.recordStreamFramesThinned("acme", 2);
  metrics.recordStreamFrameDroppedBackpressure("acme", "event");
  metrics.recordIngestRateLimitRejected("acme");
  metrics.recordStreamSubscriberLimitRejected("acme", "tenant");
  metrics.recordStreamCursorResume("acme");
  metrics.recordStreamUnsubscribe("acme", "event");

  const text = metrics.renderPrometheus();
  assert.match(text, /geochannel_ingest_events_total\{tenantId="acme"\} 3/);
  assert.match(text, /geochannel_stream_frames_sent_total\{mode="event",tenantId="acme"\} 4/);
  assert.match(text, /geochannel_stream_subscribers_current\{mode="event",tenantId="acme"\} 0/);
  assert.match(text, /geochannel_stream_frame_latency_ms_bucket\{mode="event",tenantId="acme",le="50"\} 1/);
  assert.match(text, /geochannel_ingest_rate_limit_rejections_total\{tenantId="acme"\} 1/);
  assert.match(text, /geochannel_stream_subscriber_limit_rejections_total\{limit="tenant",tenantId="acme"\} 1/);
  assert.match(text, /geochannel_stream_cursor_resumes_total\{tenantId="acme"\} 1/);
});

test("metrics registry renders summary payload with tenant/mode rows", () => {
  const metrics = new MetricsRegistry();
  metrics.recordIngest("acme", 10, 0, 20);
  metrics.recordStreamSubscribe("acme", "event");
  metrics.recordStreamFrameSent("acme", "event", 120, 40);
  metrics.recordStreamFrameDroppedBackpressure("acme", "event", 2);
  metrics.recordStreamFrameDroppedInvalid("acme", "event", 1);
  metrics.recordStreamBackpressureSignal("acme", "event");

  const summary = metrics.renderSummary();
  assert.equal(summary.status, "ok");
  assert.equal(typeof summary.generatedAt, "string");
  assert.equal(typeof summary.window.generation, "number");
  assert.equal(summary.summary.ingestEventsTotal, 10);
  assert.equal(summary.summary.streamFramesTotal, 1);
  assert.equal(summary.summary.dropsBackpressureTotal, 2);
  assert.equal(summary.summary.dropsInvalidTotal, 1);
  assert.equal(summary.summary.backpressureSignalsTotal, 1);
  assert.ok(summary.summary.latencyP99Ms === null || typeof summary.summary.latencyP99Ms === "number");
  assert.equal(Array.isArray(summary.latencyHistogram.boundsMs), true);
  assert.equal(Array.isArray(summary.latencyHistogram.cumulative), true);
  assert.equal(summary.byTenantMode.length, 1);
  assert.equal(summary.byTenantMode[0].tenantId, "acme");
  assert.equal(summary.byTenantMode[0].mode, "event");
  assert.equal(summary.byTenantMode[0].streamFramesTotal, 1);
});

test("metrics summary reset keeps gauges and zeros counter-based totals", () => {
  const metrics = new MetricsRegistry();
  metrics.recordStreamSubscribe("acme", "event");
  metrics.recordIngest("acme", 10, 0, 15);
  metrics.recordStreamFrameSent("acme", "event", 100, 25);
  const beforeReset = metrics.renderSummary();
  assert.equal(beforeReset.summary.ingestEventsTotal, 10);
  assert.equal(beforeReset.summary.streamFramesTotal, 1);
  assert.equal(beforeReset.summary.subscribersCurrent, 1);

  metrics.resetSummaryWindow();
  const afterReset = metrics.renderSummary();
  assert.equal(afterReset.summary.ingestEventsTotal, 0);
  assert.equal(afterReset.summary.streamFramesTotal, 0);
  assert.equal(afterReset.summary.subscribersCurrent, 1);
  assert.equal(afterReset.summary.backpressureSignalsTotal, 0);
  assert.equal(afterReset.summary.latencyP95Ms, null);
  assert.equal(afterReset.summary.latencyP99Ms, null);
  assert.ok(afterReset.window.generation > beforeReset.window.generation);
});
