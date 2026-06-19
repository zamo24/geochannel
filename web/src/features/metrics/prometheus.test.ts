import assert from "node:assert/strict";
import test from "node:test";
import { histogramQuantile, parsePrometheusText, sumMetric } from "./prometheus";

test("parsePrometheusText parses samples with labels", () => {
  const text = `
# HELP geochannel_stream_frames_sent_total Frames sent
geochannel_stream_frames_sent_total{tenantId="acme",mode="event"} 12
geochannel_stream_frames_sent_total{tenantId="acme",mode="aggregate"} 5
`;

  const samples = parsePrometheusText(text);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].name, "geochannel_stream_frames_sent_total");
  assert.equal(samples[0].labels.tenantId, "acme");
  assert.equal(samples[0].labels.mode, "event");
  assert.equal(samples[0].value, 12);
});

test("sumMetric sums matching samples", () => {
  const samples = parsePrometheusText(`
metric_a{tenantId="a"} 2
metric_a{tenantId="b"} 3
metric_b 9
`);
  assert.equal(sumMetric(samples, "metric_a"), 5);
  assert.equal(sumMetric(samples, "metric_a", (sample) => sample.labels.tenantId === "a"), 2);
});

test("histogramQuantile estimates quantile from buckets", () => {
  const samples = parsePrometheusText(`
lat_ms_bucket{le="10"} 2
lat_ms_bucket{le="20"} 5
lat_ms_bucket{le="+Inf"} 5
`);
  const p95 = histogramQuantile(samples, "lat_ms", 0.95);
  assert.equal(typeof p95, "number");
  assert.ok((p95 ?? 0) >= 10);
});
