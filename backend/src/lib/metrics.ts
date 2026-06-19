import {
  STREAM_LATENCY_BUCKETS_MS,
  addRecentSample,
  histogramQuantileFromCumulativeBuckets,
  labelKey,
  labelsText,
  normalizeLabels,
  recentRate
} from "./metrics-utils.js";
import type { Labels } from "./metrics-utils.js";
import type { MetricsSummaryPayload, MetricsTenantMode } from "./metrics-types.js";

type LabeledSample = {
  labels: Record<string, string>;
  value: number;
};

type HistogramSeries = {
  labels: Record<string, string>;
  buckets: number[];
  count: number;
  sum: number;
};

type HistogramMetric = {
  buckets: number[];
  series: Map<string, HistogramSeries>;
};

type HistogramBaselineSeries = {
  buckets: number[];
  count: number;
  sum: number;
};

const STREAM_LATENCY_SAMPLE_EVERY = Math.max(1, Number.parseInt(process.env.STREAM_LATENCY_SAMPLE_EVERY ?? "4", 10));

export class MetricsRegistry {
  private readonly startedAt = Date.now();
  private readonly counters = new Map<string, Map<string, LabeledSample>>();
  private readonly gauges = new Map<string, Map<string, LabeledSample>>();
  private readonly histograms = new Map<string, HistogramMetric>();
  private readonly ingestRecent = new Map<number, number>();
  private readonly streamRecent = new Map<number, number>();
  private readonly streamLatencySampleCounters = new Map<string, number>();
  private readonly countersBaseline = new Map<string, Map<string, number>>();
  private readonly histogramsBaseline = new Map<string, Map<string, HistogramBaselineSeries>>();
  private resetAt = this.startedAt;
  private resetGeneration = 1;

  incCounter(name: string, labels: Labels = {}, value = 1) {
    if (!Number.isFinite(value) || value === 0) return;
    const normalized = normalizeLabels(labels);
    const key = labelKey(normalized);
    let metric = this.counters.get(name);
    if (!metric) {
      metric = new Map();
      this.counters.set(name, metric);
    }
    const current = metric.get(key);
    if (!current) {
      metric.set(key, { labels: normalized, value });
      return;
    }
    current.value += value;
  }

  addGauge(name: string, labels: Labels = {}, delta = 0) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const normalized = normalizeLabels(labels);
    const key = labelKey(normalized);
    let metric = this.gauges.get(name);
    if (!metric) {
      metric = new Map();
      this.gauges.set(name, metric);
    }
    const current = metric.get(key);
    if (!current) {
      metric.set(key, { labels: normalized, value: delta });
      return;
    }
    current.value += delta;
  }

  setGauge(name: string, labels: Labels = {}, value = 0) {
    if (!Number.isFinite(value)) return;
    const normalized = normalizeLabels(labels);
    const key = labelKey(normalized);
    let metric = this.gauges.get(name);
    if (!metric) {
      metric = new Map();
      this.gauges.set(name, metric);
    }
    metric.set(key, { labels: normalized, value });
  }

  observeHistogram(name: string, labels: Labels = {}, value = 0, buckets: number[] = STREAM_LATENCY_BUCKETS_MS) {
    if (!Number.isFinite(value) || value < 0) return;
    const normalized = normalizeLabels(labels);
    const key = labelKey(normalized);

    let metric = this.histograms.get(name);
    if (!metric) {
      metric = {
        buckets: [...buckets].sort((a, b) => a - b),
        series: new Map()
      };
      this.histograms.set(name, metric);
    }

    let series = metric.series.get(key);
    if (!series) {
      series = {
        labels: normalized,
        buckets: metric.buckets.map(() => 0),
        count: 0,
        sum: 0
      };
      metric.series.set(key, series);
    }

    series.count += 1;
    series.sum += value;
    for (let i = 0; i < metric.buckets.length; i += 1) {
      if (value <= metric.buckets[i]) {
        series.buckets[i] += 1;
      }
    }
  }

  recordIngest(tenantId: string, acceptedEvents: number, rejectedEvents: number, requestMs: number) {
    const now = Date.now();
    this.incCounter("geochannel_ingest_requests_total", { tenantId });
    this.incCounter("geochannel_ingest_events_total", { tenantId }, acceptedEvents);
    if (rejectedEvents > 0) {
      this.incCounter("geochannel_ingest_events_rejected_total", { tenantId }, rejectedEvents);
    }
    this.observeHistogram("geochannel_ingest_request_duration_ms", { tenantId }, requestMs, [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]);
    addRecentSample(this.ingestRecent, acceptedEvents, now);
    this.setGauge("geochannel_ingest_events_rate_1m", {}, recentRate(this.ingestRecent, 60, now));
  }

  recordIngestRateLimitRejected(tenantId: string) {
    this.incCounter("geochannel_ingest_rate_limit_rejections_total", { tenantId });
  }

  recordStreamSubscribe(tenantId: string, mode: "event" | "aggregate") {
    this.incCounter("geochannel_stream_subscriptions_total", { tenantId, mode });
    this.addGauge("geochannel_stream_subscribers_current", { tenantId, mode }, 1);
  }

  recordStreamUnsubscribe(tenantId: string, mode: "event" | "aggregate") {
    this.addGauge("geochannel_stream_subscribers_current", { tenantId, mode }, -1);
  }

  recordStreamSubscriberLimitRejected(tenantId: string, limit: "tenant" | "channel") {
    this.incCounter("geochannel_stream_subscriber_limit_rejections_total", { tenantId, limit });
  }

  recordStreamCursorResume(tenantId: string) {
    this.incCounter("geochannel_stream_cursor_resumes_total", { tenantId });
  }

  recordStreamFrameSent(
    tenantId: string,
    mode: "event" | "aggregate",
    bytes: number,
    latencyMs: number | null
  ) {
    this.recordStreamFramesSentBatch(tenantId, mode, 1, bytes, latencyMs);
  }

  recordStreamFramesSentBatch(
    tenantId: string,
    mode: "event" | "aggregate",
    frameCount: number,
    totalBytes: number,
    latencyMs: number | null
  ) {
    const safeFrameCount = Number.isFinite(frameCount) ? Math.max(1, Math.floor(frameCount)) : 1;
    const safeTotalBytes = Number.isFinite(totalBytes) ? Math.max(0, totalBytes) : 0;
    const now = Date.now();
    this.incCounter("geochannel_stream_frames_sent_total", { tenantId, mode }, safeFrameCount);
    this.incCounter("geochannel_stream_bytes_sent_total", { tenantId, mode }, safeTotalBytes);
    if (latencyMs !== null && Number.isFinite(latencyMs) && latencyMs >= 0) {
      if (STREAM_LATENCY_SAMPLE_EVERY <= 1) {
        this.observeHistogram("geochannel_stream_frame_latency_ms", { tenantId, mode }, latencyMs);
      } else {
        const sampleKey = `${tenantId}|${mode}`;
        const nextCount = (this.streamLatencySampleCounters.get(sampleKey) ?? 0) + 1;
        if (nextCount >= STREAM_LATENCY_SAMPLE_EVERY) {
          this.streamLatencySampleCounters.set(sampleKey, 0);
          this.observeHistogram("geochannel_stream_frame_latency_ms", { tenantId, mode }, latencyMs);
        } else {
          this.streamLatencySampleCounters.set(sampleKey, nextCount);
        }
      }
    }
    addRecentSample(this.streamRecent, safeFrameCount, now);
    this.setGauge("geochannel_stream_frames_rate_1m", {}, recentRate(this.streamRecent, 60, now));
  }

  recordStreamFramesThinned(tenantId: string, count: number) {
    this.incCounter("geochannel_stream_frames_thinned_total", { tenantId }, count);
  }

  recordStreamFrameDroppedBackpressure(tenantId: string, mode: "event" | "aggregate", count = 1) {
    this.incCounter("geochannel_stream_frames_dropped_backpressure_total", { tenantId, mode }, count);
  }

  recordStreamFrameDroppedInvalid(tenantId: string, mode: "event" | "aggregate", count = 1) {
    this.incCounter("geochannel_stream_frames_dropped_invalid_total", { tenantId, mode }, count);
  }

  recordStreamBackpressureSignal(tenantId: string, mode: "event" | "aggregate") {
    this.incCounter("geochannel_stream_backpressure_signals_total", { tenantId, mode });
  }

  private seriesFrom(store: Map<string, Map<string, LabeledSample>>, name: string) {
    return Array.from(store.get(name)?.values() ?? []);
  }

  private sumFrom(store: Map<string, Map<string, LabeledSample>>, name: string) {
    return this.seriesFrom(store, name).reduce((total, sample) => total + sample.value, 0);
  }

  private counterDeltaSinceReset(name: string, labels: Record<string, string>, value: number) {
    const key = labelKey(labels);
    const baseline = this.countersBaseline.get(name)?.get(key) ?? 0;
    return Math.max(0, value - baseline);
  }

  private seriesFromCountersSinceReset(name: string) {
    return this.seriesFrom(this.counters, name)
      .map((series) => ({
        labels: series.labels,
        value: this.counterDeltaSinceReset(name, series.labels, series.value)
      }))
      .filter((series) => series.value > 0);
  }

  private sumCountersSinceReset(name: string) {
    return this.seriesFromCountersSinceReset(name).reduce((total, sample) => total + sample.value, 0);
  }

  private aggregateHistogramSinceReset(name: string) {
    const metric = this.histograms.get(name);
    if (!metric) return null;
    const cumulative = metric.buckets.map(() => 0);
    let count = 0;
    let sum = 0;
    const baselineBySeries = this.histogramsBaseline.get(name);

    for (const series of metric.series.values()) {
      const baseline = baselineBySeries?.get(labelKey(series.labels));
      for (let i = 0; i < cumulative.length; i += 1) {
        cumulative[i] += Math.max(0, (series.buckets[i] ?? 0) - (baseline?.buckets[i] ?? 0));
      }
      count += Math.max(0, series.count - (baseline?.count ?? 0));
      sum += Math.max(0, series.sum - (baseline?.sum ?? 0));
    }

    return {
      bounds: metric.buckets,
      cumulative,
      count,
      sum
    };
  }

  private buildTenantModeSummary() {
    const byKey = new Map<string, MetricsTenantMode>();

    const ensureEntry = (labels: Record<string, string>) => {
      const tenantId = labels.tenantId ?? "all";
      const mode = labels.mode ?? "all";
      const key = `${tenantId}|${mode}`;
      const existing = byKey.get(key);
      if (existing) return existing;
      const created: MetricsTenantMode = {
        tenantId,
        mode,
        streamFramesTotal: 0,
        subscribersCurrent: 0,
        dropsBackpressureTotal: 0,
        dropsInvalidTotal: 0,
        backpressureSignalsTotal: 0
      };
      byKey.set(key, created);
      return created;
    };

    for (const series of this.seriesFromCountersSinceReset("geochannel_stream_frames_sent_total")) {
      const entry = ensureEntry(series.labels);
      entry.streamFramesTotal += series.value;
    }
    for (const series of this.seriesFrom(this.gauges, "geochannel_stream_subscribers_current")) {
      const entry = ensureEntry(series.labels);
      entry.subscribersCurrent += series.value;
    }
    for (const series of this.seriesFromCountersSinceReset("geochannel_stream_frames_dropped_backpressure_total")) {
      const entry = ensureEntry(series.labels);
      entry.dropsBackpressureTotal += series.value;
    }
    for (const series of this.seriesFromCountersSinceReset("geochannel_stream_frames_dropped_invalid_total")) {
      const entry = ensureEntry(series.labels);
      entry.dropsInvalidTotal += series.value;
    }
    for (const series of this.seriesFromCountersSinceReset("geochannel_stream_backpressure_signals_total")) {
      const entry = ensureEntry(series.labels);
      entry.backpressureSignalsTotal += series.value;
    }

    return Array.from(byKey.values()).sort((a, b) => {
      if (b.streamFramesTotal !== a.streamFramesTotal) {
        return b.streamFramesTotal - a.streamFramesTotal;
      }
      if (a.tenantId !== b.tenantId) return a.tenantId.localeCompare(b.tenantId);
      return a.mode.localeCompare(b.mode);
    });
  }

  resetSummaryWindow() {
    this.countersBaseline.clear();
    for (const [name, seriesMap] of this.counters.entries()) {
      const baselineSeries = new Map<string, number>();
      for (const series of seriesMap.values()) {
        baselineSeries.set(labelKey(series.labels), series.value);
      }
      this.countersBaseline.set(name, baselineSeries);
    }

    this.histogramsBaseline.clear();
    for (const [name, metric] of this.histograms.entries()) {
      const baselineSeries = new Map<string, HistogramBaselineSeries>();
      for (const series of metric.series.values()) {
        baselineSeries.set(labelKey(series.labels), {
          buckets: [...series.buckets],
          count: series.count,
          sum: series.sum
        });
      }
      this.histogramsBaseline.set(name, baselineSeries);
    }

    this.resetAt = Date.now();
    this.resetGeneration += 1;
  }

  renderSummary(): MetricsSummaryPayload {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const startedAtSec = Math.floor(this.startedAt / 1000);
    const resetAtSec = Math.floor(this.resetAt / 1000);
    const streamLatencyHistogram = this.aggregateHistogramSinceReset("geochannel_stream_frame_latency_ms");
    const latencyHistogramPayload = streamLatencyHistogram ?? {
      bounds: STREAM_LATENCY_BUCKETS_MS,
      cumulative: STREAM_LATENCY_BUCKETS_MS.map(() => 0),
      count: 0,
      sum: 0
    };
    const latencyP95Ms = streamLatencyHistogram
      ? histogramQuantileFromCumulativeBuckets(streamLatencyHistogram.bounds, streamLatencyHistogram.cumulative, 0.95)
      : null;
    const latencyP99Ms = streamLatencyHistogram
      ? histogramQuantileFromCumulativeBuckets(streamLatencyHistogram.bounds, streamLatencyHistogram.cumulative, 0.99)
      : null;

    return {
      status: "ok",
      generatedAt: new Date(nowMs).toISOString(),
      process: {
        startedAtSec,
        uptimeSec: Math.max(0, nowSec - startedAtSec)
      },
      window: {
        resetAtSec,
        sinceResetSec: Math.max(0, nowSec - resetAtSec),
        generation: this.resetGeneration
      },
      summary: {
        ingestRate1m: this.sumFrom(this.gauges, "geochannel_ingest_events_rate_1m"),
        streamRate1m: this.sumFrom(this.gauges, "geochannel_stream_frames_rate_1m"),
        subscribersCurrent: this.sumFrom(this.gauges, "geochannel_stream_subscribers_current"),
        latencyP95Ms,
        latencyP99Ms,
        ingestEventsTotal: this.sumCountersSinceReset("geochannel_ingest_events_total"),
        streamFramesTotal: this.sumCountersSinceReset("geochannel_stream_frames_sent_total"),
        dropsBackpressureTotal: this.sumCountersSinceReset("geochannel_stream_frames_dropped_backpressure_total"),
        dropsInvalidTotal: this.sumCountersSinceReset("geochannel_stream_frames_dropped_invalid_total"),
        backpressureSignalsTotal: this.sumCountersSinceReset("geochannel_stream_backpressure_signals_total")
      },
      latencyHistogram: {
        boundsMs: [...latencyHistogramPayload.bounds],
        cumulative: [...latencyHistogramPayload.cumulative],
        sampleCount: latencyHistogramPayload.count,
        sumMs: latencyHistogramPayload.sum
      },
      byTenantMode: this.buildTenantModeSummary()
    };
  }

  renderPrometheus() {
    const lines: string[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    lines.push("# HELP geochannel_process_start_time_seconds Process start unix timestamp.");
    lines.push("# TYPE geochannel_process_start_time_seconds gauge");
    lines.push(`geochannel_process_start_time_seconds ${Math.floor(this.startedAt / 1000)}`);
    lines.push("# HELP geochannel_process_uptime_seconds Process uptime in seconds.");
    lines.push("# TYPE geochannel_process_uptime_seconds gauge");
    lines.push(`geochannel_process_uptime_seconds ${Math.max(0, nowSec - Math.floor(this.startedAt / 1000))}`);

    for (const [name, seriesMap] of this.counters.entries()) {
      lines.push(`# TYPE ${name} counter`);
      for (const series of seriesMap.values()) {
        lines.push(`${name}${labelsText(series.labels)} ${series.value}`);
      }
    }

    for (const [name, seriesMap] of this.gauges.entries()) {
      lines.push(`# TYPE ${name} gauge`);
      for (const series of seriesMap.values()) {
        lines.push(`${name}${labelsText(series.labels)} ${series.value}`);
      }
    }

    for (const [name, metric] of this.histograms.entries()) {
      lines.push(`# TYPE ${name} histogram`);
      for (const series of metric.series.values()) {
        for (let i = 0; i < metric.buckets.length; i += 1) {
          const bucketLabels = {
            ...series.labels,
            le: String(metric.buckets[i])
          };
          lines.push(`${name}_bucket${labelsText(bucketLabels)} ${series.buckets[i]}`);
        }
        lines.push(`${name}_bucket${labelsText({ ...series.labels, le: "+Inf" })} ${series.count}`);
        lines.push(`${name}_sum${labelsText(series.labels)} ${series.sum}`);
        lines.push(`${name}_count${labelsText(series.labels)} ${series.count}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }
}
