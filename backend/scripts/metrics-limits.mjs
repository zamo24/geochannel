import * as h3 from "h3-js";
import { writeFile } from "node:fs/promises";

const env = {
  API_BASE: process.env.API_BASE ?? "http://localhost:8081",
  TENANT_ID: process.env.LIMIT_TENANT_ID ?? "bench-limits",
  CHANNEL_RES: Number.parseInt(process.env.LIMIT_CHANNEL_RES ?? "8", 10),
  CHANNEL_TTL_SEC: Number.parseInt(process.env.LIMIT_CHANNEL_TTL_SEC ?? "0", 10),
  CENTER_LON: Number.parseFloat(process.env.LIMIT_CENTER_LON ?? "-73.9857"),
  CENTER_LAT: Number.parseFloat(process.env.LIMIT_CENTER_LAT ?? "40.7484"),
  TILE: (process.env.LIMIT_TILE ?? "").trim(),
  DURATION_SEC: Number.parseInt(process.env.LIMIT_STAGE_DURATION_SEC ?? "20", 10),
  WARMUP_SEC: Number.parseInt(process.env.LIMIT_STAGE_WARMUP_SEC ?? "3", 10),
  DRAIN_MS: Number.parseInt(process.env.LIMIT_STAGE_DRAIN_MS ?? "800", 10),
  TRANSITION_DRAIN_TIMEOUT_MS: Number.parseInt(process.env.LIMIT_TRANSITION_DRAIN_TIMEOUT_MS ?? "5000", 10),
  TRANSITION_DRAIN_POLL_MS: Number.parseInt(process.env.LIMIT_TRANSITION_DRAIN_POLL_MS ?? "100", 10),
  RATE_BASE: Number.parseInt(process.env.LIMIT_INGEST_RATE_BASE ?? "100", 10),
  RATE_STEP: Number.parseInt(process.env.LIMIT_INGEST_RATE_STEP ?? "150", 10),
  RATE_MAX: Number.parseInt(process.env.LIMIT_INGEST_RATE_MAX ?? "3000", 10),
  CLIENT_BASE: Number.parseInt(process.env.LIMIT_CLIENTS_BASE ?? "10", 10),
  CLIENT_STEP: Number.parseInt(process.env.LIMIT_CLIENTS_STEP ?? "10", 10),
  CLIENT_MAX: Number.parseInt(process.env.LIMIT_CLIENTS_MAX ?? "250", 10),
  MAX_STAGES: Number.parseInt(process.env.LIMIT_MAX_STAGES ?? "20", 10),
  INGEST_TICK_MS: Number.parseInt(process.env.LIMIT_INGEST_TICK_MS ?? "200", 10),
  INGEST_MAX_IN_FLIGHT: Number.parseInt(process.env.LIMIT_INGEST_MAX_IN_FLIGHT ?? "32", 10),
  ASSET_COUNT: Number.parseInt(process.env.LIMIT_ASSET_COUNT ?? "1000", 10),
  MAX_METRIC_P95_MS: Number.parseFloat(process.env.LIMIT_MAX_METRIC_P95_MS ?? "0"),
  MAX_CLIENT_P95_MS: Number.parseFloat(process.env.LIMIT_MAX_CLIENT_P95_MS ?? "1500"),
  MAX_CLIENT_P99_MS: Number.parseFloat(process.env.LIMIT_MAX_CLIENT_P99_MS ?? "0"),
  MAX_DROP_RATE: Number.parseFloat(process.env.LIMIT_MAX_DROP_RATE ?? "0.01"),
  STOP_ON_FAILURE: parseBool(process.env.LIMIT_STOP_ON_FAILURE, true),
  METRICS_RESET_PER_STAGE: parseBool(process.env.LIMIT_METRICS_RESET_PER_STAGE, false),
  METRICS_RESET_STRICT: parseBool(process.env.LIMIT_METRICS_RESET_STRICT, false),
  METRICS_RESET_TOKEN: (process.env.LIMIT_METRICS_RESET_TOKEN ?? "").trim(),
  METRICS_AUTH_TOKEN: (process.env.LIMIT_METRICS_AUTH_TOKEN ?? "").trim(),
  STREAM_AUTH_REQUIRED: parseBool(process.env.LIMIT_STREAM_AUTH_REQUIRED, false),
  INGEST_API_KEY: (process.env.LIMIT_INGEST_API_KEY ?? "").trim(),
  TENANT_API_KEY: (process.env.LIMIT_TENANT_API_KEY ?? process.env.LIMIT_INGEST_API_KEY ?? "").trim(),
  STREAM_TOKEN_TTL_SEC: Number.parseInt(process.env.LIMIT_STREAM_TOKEN_TTL_SEC ?? "900", 10),
  OUTPUT_FILE: (process.env.LIMIT_OUTPUT_FILE ?? "").trim()
};

function parseBool(raw, fallback) {
  if (raw === undefined) return fallback;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function histogramQuantileFromCumulativeBuckets(bounds, cumulative, quantile) {
  if (!Array.isArray(bounds) || !Array.isArray(cumulative) || bounds.length === 0 || bounds.length !== cumulative.length) {
    return null;
  }
  const total = cumulative[cumulative.length - 1];
  if (!Number.isFinite(total) || total <= 0) return null;

  const target = total * quantile;
  let prevBound = 0;
  let prevCount = 0;
  for (let i = 0; i < bounds.length; i += 1) {
    const bound = bounds[i];
    const bucketCount = cumulative[i];
    if (bucketCount < target) {
      prevBound = bound;
      prevCount = bucketCount;
      continue;
    }
    const countInBucket = bucketCount - prevCount;
    if (countInBucket <= 0) return bound;
    const position = (target - prevCount) / countInBucket;
    return prevBound + (bound - prevBound) * position;
  }
  return bounds[bounds.length - 1] ?? null;
}

function histogramDelta(startHistogram, endHistogram) {
  if (!startHistogram || !endHistogram) return null;
  if (!Array.isArray(startHistogram.boundsMs) || !Array.isArray(endHistogram.boundsMs)) return null;
  if (startHistogram.boundsMs.length === 0 || endHistogram.boundsMs.length === 0) return null;
  if (startHistogram.boundsMs.length !== endHistogram.boundsMs.length) return null;
  if (JSON.stringify(startHistogram.boundsMs) !== JSON.stringify(endHistogram.boundsMs)) return null;
  if (!Array.isArray(startHistogram.cumulative) || !Array.isArray(endHistogram.cumulative)) return null;
  if (startHistogram.cumulative.length !== endHistogram.cumulative.length) return null;

  const cumulative = endHistogram.cumulative.map((value, index) =>
    Math.max(0, Number(value ?? 0) - Number(startHistogram.cumulative[index] ?? 0))
  );
  const sampleCount = Math.max(0, Number(endHistogram.sampleCount ?? 0) - Number(startHistogram.sampleCount ?? 0));
  const sumMs = Math.max(0, Number(endHistogram.sumMs ?? 0) - Number(startHistogram.sumMs ?? 0));
  return {
    boundsMs: endHistogram.boundsMs,
    cumulative,
    sampleCount,
    sumMs
  };
}

function makeAssets(count) {
  return Array.from({ length: count }, (_, i) => `asset-${i + 1}`);
}

function aggregateTenantMode(rows, tenantId) {
  return rows
    .filter((row) => row.tenantId === tenantId)
    .reduce(
      (acc, row) => {
        acc.streamFramesTotal += row.streamFramesTotal;
        acc.subscribersCurrent += row.subscribersCurrent;
        acc.dropsBackpressureTotal += row.dropsBackpressureTotal;
        acc.dropsInvalidTotal += row.dropsInvalidTotal;
        acc.backpressureSignalsTotal += row.backpressureSignalsTotal;
        return acc;
      },
      {
        streamFramesTotal: 0,
        subscribersCurrent: 0,
        dropsBackpressureTotal: 0,
        dropsInvalidTotal: 0,
        backpressureSignalsTotal: 0
      }
    );
}

function summarizeStreamClients(stats) {
  const latencies = stats.flatMap((item) => item.latenciesMs);
  return {
    frames: stats.reduce((sum, item) => sum + item.frames, 0),
    bytes: stats.reduce((sum, item) => sum + item.bytes, 0),
    parseErrors: stats.reduce((sum, item) => sum + item.parseErrors, 0),
    connectErrors: stats.reduce((sum, item) => sum + item.connectErrors, 0),
    readyEvents: stats.reduce((sum, item) => sum + item.readyEvents, 0),
    latencyP95Ms: percentile(latencies, 95),
    latencyP99Ms: percentile(latencies, 99)
  };
}

function toFiniteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${url} failed (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

function jsonHeaders(apiKey, tenantId) {
  return {
    "content-type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : { "x-tenant-id": tenantId })
  };
}

function publicConfig() {
  const config = { ...env };
  for (const key of ["METRICS_RESET_TOKEN", "METRICS_AUTH_TOKEN", "INGEST_API_KEY", "TENANT_API_KEY"]) {
    config[key] = config[key] ? "[redacted]" : "";
  }
  return config;
}

async function createChannel(tile) {
  const estimatedRunSec = Math.ceil(
    env.MAX_STAGES * (env.WARMUP_SEC + env.DURATION_SEC + env.DRAIN_MS / 1000) + 60
  );
  const ttlSec = env.CHANNEL_TTL_SEC > 0 ? env.CHANNEL_TTL_SEC : Math.max(120, estimatedRunSec);

  return fetchJson(new URL("/channels", env.API_BASE).toString(), {
    method: "POST",
    headers: jsonHeaders(env.TENANT_API_KEY, env.TENANT_ID),
    body: JSON.stringify({
      tenantId: env.TENANT_ID,
      tiles: [tile],
      res: env.CHANNEL_RES,
      ttlSec
    })
  });
}

async function mintToken(channelId) {
  return fetchJson(new URL("/token", env.API_BASE).toString(), {
    method: "POST",
    headers: jsonHeaders(env.TENANT_API_KEY, env.TENANT_ID),
    body: JSON.stringify({
      channelId,
      tenantId: env.TENANT_ID,
      ttlSec: env.STREAM_TOKEN_TTL_SEC
    })
  });
}

async function fetchMetricsSummary() {
  return fetchJson(new URL("/metrics/summary", env.API_BASE).toString(), {
    headers: env.METRICS_AUTH_TOKEN ? { authorization: `Bearer ${env.METRICS_AUTH_TOKEN}` } : undefined
  });
}

async function waitForSubscriberDrain() {
  const startedAtMs = Date.now();
  const timeoutMs = Math.max(0, env.TRANSITION_DRAIN_TIMEOUT_MS);
  const pollMs = Math.max(10, env.TRANSITION_DRAIN_POLL_MS);
  let subscribersCurrent = null;

  while (Date.now() - startedAtMs <= timeoutMs) {
    const metrics = await fetchMetricsSummary();
    subscribersCurrent = aggregateTenantMode(metrics.byTenantMode, env.TENANT_ID).subscribersCurrent;
    if (subscribersCurrent === 0) {
      return {
        drained: true,
        elapsedMs: Date.now() - startedAtMs,
        subscribersCurrent
      };
    }
    await sleep(pollMs);
  }

  return {
    drained: false,
    elapsedMs: Date.now() - startedAtMs,
    subscribersCurrent
  };
}

async function resetMetricsSummaryWindow() {
  const res = await fetch(new URL("/metrics/reset", env.API_BASE).toString(), {
    method: "POST",
    headers: {
      ...(env.METRICS_AUTH_TOKEN ? { authorization: `Bearer ${env.METRICS_AUTH_TOKEN}` } : {}),
      ...(env.METRICS_RESET_TOKEN ? { "x-metrics-reset-token": env.METRICS_RESET_TOKEN } : {})
    }
  });
  if (res.status === 404) {
    throw new Error("/metrics/reset not enabled (404). Set METRICS_RESET_ENABLED=true on backend.");
  }
  if (res.status === 401) {
    throw new Error("/metrics/reset unauthorized (401). Check LIMIT_METRICS_RESET_TOKEN.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`/metrics/reset failed (${res.status}): ${body}`);
  }
}

async function collectSse(url, headers, signal, stats) {
  try {
    const res = await fetch(url, {
      headers,
      signal
    });
    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");

      let idx = buffer.indexOf("\n\n");
      while (idx >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf("\n\n");
        if (!raw || raw.startsWith(":")) continue;

        const lines = raw.split("\n");
        const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
        const dataLines = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length === 0) continue;
        const payloadText = dataLines.join("\n");

        let payload = null;
        try {
          payload = JSON.parse(payloadText);
        } catch {
          stats.parseErrors += 1;
          continue;
        }

        if (eventName === "ready") {
          stats.readyEvents += 1;
          continue;
        }
        if (!payload || typeof payload !== "object") continue;
        if (payload.type !== "event" && payload.type !== "aggregate") continue;
        stats.frames += 1;
        stats.bytes += Buffer.byteLength(payloadText, "utf8");
        if (typeof payload.ts === "string") {
          const tsMs = Date.parse(payload.ts);
          if (Number.isFinite(tsMs)) {
            const latency = Date.now() - tsMs;
            if (latency >= 0) stats.latenciesMs.push(latency);
          }
        }
      }
    }
  } catch (err) {
    if (signal.aborted) return;
    stats.connectErrors += 1;
  }
}

async function runIngest(ratePerSec, durationSec, assets) {
  const tickMs = Math.max(50, env.INGEST_TICK_MS);
  const batchSize = Math.max(1, Math.round((ratePerSec * tickMs) / 1000));
  const startedAtMs = Date.now();
  const untilMs = startedAtMs + durationSec * 1000;
  let nextTickMs = startedAtMs;

  const ingestHeaders = {
    ...jsonHeaders(env.INGEST_API_KEY, env.TENANT_ID)
  };

  let seq = 0;
  let requests = 0;
  let sent = 0;
  let accepted = 0;
  let failedRequests = 0;
  let maxInFlight = 0;
  const inFlight = new Set();

  while (Date.now() < untilMs) {
    if (Date.now() < nextTickMs) {
      await sleep(nextTickMs - Date.now());
      continue;
    }

    requests += 1;
    const nowIso = new Date().toISOString();
    const events = Array.from({ length: batchSize }, () => {
      seq += 1;
      const id = assets[(seq - 1) % assets.length];
      return {
        id,
        ts: nowIso,
        loc: [env.CENTER_LON, env.CENTER_LAT],
        attrs: {
          speed: 20 + (seq % 70),
          stageSeq: seq
        }
      };
    });

    sent += events.length;
    const task = fetchJson(new URL("/ingest/events", env.API_BASE).toString(), {
      method: "POST",
      headers: ingestHeaders,
      body: JSON.stringify(events)
    })
      .then((payload) => {
        accepted += Number(payload.accepted ?? 0);
      })
      .catch(() => {
        failedRequests += 1;
      })
      .finally(() => {
        inFlight.delete(task);
      });
    inFlight.add(task);
    maxInFlight = Math.max(maxInFlight, inFlight.size);
    nextTickMs += tickMs;

    if (inFlight.size >= Math.max(1, env.INGEST_MAX_IN_FLIGHT)) {
      await Promise.race(inFlight);
    }
  }

  await Promise.allSettled(inFlight);
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  return {
    ratePerSec,
    achievedSentRatePerSec: sent / elapsedSec,
    achievedAcceptedRatePerSec: accepted / elapsedSec,
    requests,
    sent,
    accepted,
    failedRequests,
    maxInFlight
  };
}

async function runStage({ stageNo, ingestRatePerSec, streamClients, channelId }) {
  const streamUrl = new URL("/stream", env.API_BASE);
  streamUrl.searchParams.set("channelId", channelId);
  streamUrl.searchParams.set("offset", "$");

  let streamHeaders = undefined;
  if (env.STREAM_AUTH_REQUIRED) {
    const tokenPayload = await mintToken(channelId);
    streamHeaders = {
      authorization: `Bearer ${tokenPayload.token}`
    };
  }

  const controller = new AbortController();
  const clientStats = Array.from({ length: streamClients }, () => ({
    frames: 0,
    bytes: 0,
    latenciesMs: [],
    parseErrors: 0,
    connectErrors: 0,
    readyEvents: 0
  }));

  const clientTasks = clientStats.map((stats) => collectSse(streamUrl.toString(), streamHeaders, controller.signal, stats));
  await sleep(Math.max(0, env.WARMUP_SEC) * 1000);

  let metricsResetApplied = false;
  if (env.METRICS_RESET_PER_STAGE) {
    try {
      await resetMetricsSummaryWindow();
      metricsResetApplied = true;
    } catch (err) {
      if (env.METRICS_RESET_STRICT) {
        throw err;
      }
      console.log(`[limits] stage ${stageNo} WARN metrics reset skipped: ${err?.message ?? err}`);
    }
  }

  const metricsStart = await fetchMetricsSummary();
  const assets = makeAssets(env.ASSET_COUNT);
  const ingest = await runIngest(ingestRatePerSec, env.DURATION_SEC, assets);
  await sleep(Math.max(0, env.DRAIN_MS));
  const metricsEnd = await fetchMetricsSummary();

  controller.abort();
  await Promise.allSettled(clientTasks);
  const transitionDrain = await waitForSubscriberDrain();

  const streamSummary = summarizeStreamClients(clientStats);
  const tenantStart = aggregateTenantMode(metricsStart.byTenantMode, env.TENANT_ID);
  const tenantEnd = aggregateTenantMode(metricsEnd.byTenantMode, env.TENANT_ID);

  const tenantStreamFramesDelta = tenantEnd.streamFramesTotal - tenantStart.streamFramesTotal;
  const tenantDropsBackpressureDelta = tenantEnd.dropsBackpressureTotal - tenantStart.dropsBackpressureTotal;
  const tenantDropsInvalidDelta = tenantEnd.dropsInvalidTotal - tenantStart.dropsInvalidTotal;
  const tenantBackpressureSignalsDelta = tenantEnd.backpressureSignalsTotal - tenantStart.backpressureSignalsTotal;
  const ingestEventsDelta = metricsEnd.summary.ingestEventsTotal - metricsStart.summary.ingestEventsTotal;
  const latencyHistogramDelta = histogramDelta(metricsStart.latencyHistogram, metricsEnd.latencyHistogram);
  const metricsLatencyP95StageMs = latencyHistogramDelta
    ? histogramQuantileFromCumulativeBuckets(latencyHistogramDelta.boundsMs, latencyHistogramDelta.cumulative, 0.95)
    : null;
  const metricsLatencyP99StageMs = latencyHistogramDelta
    ? histogramQuantileFromCumulativeBuckets(latencyHistogramDelta.boundsMs, latencyHistogramDelta.cumulative, 0.99)
    : null;

  const totalDropsDelta = Math.max(0, tenantDropsBackpressureDelta + tenantDropsInvalidDelta);
  const dropRate = tenantStreamFramesDelta > 0 ? totalDropsDelta / tenantStreamFramesDelta : 0;
  const stageStats = {
    metricsLatencyP95Ms: toFiniteOrNull(metricsLatencyP95StageMs),
    metricsLatencyP99Ms: toFiniteOrNull(metricsLatencyP99StageMs),
    clientLatencyP95Ms: toFiniteOrNull(streamSummary.latencyP95Ms),
    clientLatencyP99Ms: toFiniteOrNull(streamSummary.latencyP99Ms),
    dropRate,
    dropRatePct: dropRate * 100,
    ingestAccepted: ingest.accepted,
    streamFrames: tenantStreamFramesDelta,
    latencySamples: latencyHistogramDelta?.sampleCount ?? null,
    metricsResetApplied,
    streamConnectErrors: streamSummary.connectErrors,
    streamParseErrors: streamSummary.parseErrors
  };

  const failureReasons = [];
  if (
    Number.isFinite(env.MAX_METRIC_P95_MS) &&
    env.MAX_METRIC_P95_MS > 0 &&
    stageStats.metricsLatencyP95Ms !== null &&
    stageStats.metricsLatencyP95Ms > env.MAX_METRIC_P95_MS
  ) {
    failureReasons.push(`metrics latency p95 ${stageStats.metricsLatencyP95Ms.toFixed(1)}ms > ${env.MAX_METRIC_P95_MS}ms`);
  }
  if (Number.isFinite(env.MAX_CLIENT_P95_MS) && streamSummary.latencyP95Ms !== null && streamSummary.latencyP95Ms > env.MAX_CLIENT_P95_MS) {
    failureReasons.push(`client latency p95 ${streamSummary.latencyP95Ms.toFixed(1)}ms > ${env.MAX_CLIENT_P95_MS}ms`);
  }
  if (
    Number.isFinite(env.MAX_CLIENT_P99_MS) &&
    env.MAX_CLIENT_P99_MS > 0 &&
    streamSummary.latencyP99Ms !== null &&
    streamSummary.latencyP99Ms > env.MAX_CLIENT_P99_MS
  ) {
    failureReasons.push(`client latency p99 ${streamSummary.latencyP99Ms.toFixed(1)}ms > ${env.MAX_CLIENT_P99_MS}ms`);
  }
  if (Number.isFinite(env.MAX_DROP_RATE) && dropRate > env.MAX_DROP_RATE) {
    failureReasons.push(`drop rate ${(dropRate * 100).toFixed(2)}% > ${(env.MAX_DROP_RATE * 100).toFixed(2)}%`);
  }
  if (streamSummary.connectErrors > 0) {
    failureReasons.push(`stream connect/read errors: ${streamSummary.connectErrors}`);
  }
  if (ingest.failedRequests > 0) {
    failureReasons.push(`ingest failed requests: ${ingest.failedRequests}`);
  }
  if (!transitionDrain.drained) {
    failureReasons.push(
      `subscriber transition drain timed out with ${transitionDrain.subscribersCurrent ?? "unknown"} subscribers`
    );
  }

  return {
    stageNo,
    ingestRatePerSec,
    streamClients,
    thresholds: {
      maxMetricP95Ms: env.MAX_METRIC_P95_MS,
      maxClientP95Ms: env.MAX_CLIENT_P95_MS,
      maxClientP99Ms: env.MAX_CLIENT_P99_MS,
      maxDropRate: env.MAX_DROP_RATE
    },
    ingest,
    stream: streamSummary,
    transitionDrain,
    metricsDelta: {
      ingestEventsTotal: ingestEventsDelta,
      tenantStreamFramesTotal: tenantStreamFramesDelta,
      tenantDropsBackpressureTotal: tenantDropsBackpressureDelta,
      tenantDropsInvalidTotal: tenantDropsInvalidDelta,
      tenantBackpressureSignalsTotal: tenantBackpressureSignalsDelta,
      dropRate
    },
    stageStats,
    metricsWindowEnd: metricsEnd.window ?? null,
    metricsSnapshotEnd: metricsEnd.summary,
    passed: failureReasons.length === 0,
    failureReasons
  };
}

async function checkHealth() {
  return fetchJson(new URL("/health", env.API_BASE).toString());
}

async function main() {
  const tile = env.TILE || h3.latLngToCell(env.CENTER_LAT, env.CENTER_LON, env.CHANNEL_RES);
  console.log("[limits] API_BASE", env.API_BASE);
  console.log("[limits] tenant", env.TENANT_ID);
  console.log("[limits] channelRes", env.CHANNEL_RES, "tile", tile);
  if (env.CHANNEL_TTL_SEC > 0) {
    console.log("[limits] channel ttl (explicit)", env.CHANNEL_TTL_SEC, "sec");
  } else {
    const estimatedRunSec = Math.ceil(
      env.MAX_STAGES * (env.WARMUP_SEC + env.DURATION_SEC + env.DRAIN_MS / 1000) + 60
    );
    console.log("[limits] channel ttl (auto)", Math.max(120, estimatedRunSec), "sec");
  }
  console.log("[limits] stages", `rate ${env.RATE_BASE}->${env.RATE_MAX} step ${env.RATE_STEP}`, `clients ${env.CLIENT_BASE}->${env.CLIENT_MAX} step ${env.CLIENT_STEP}`);
  console.log("[limits] thresholds", {
    maxMetricP95Ms: env.MAX_METRIC_P95_MS,
    maxClientP95Ms: env.MAX_CLIENT_P95_MS,
    maxClientP99Ms: env.MAX_CLIENT_P99_MS,
    maxDropRate: env.MAX_DROP_RATE
  });
  console.log("[limits] metrics reset per stage", env.METRICS_RESET_PER_STAGE, "strict", env.METRICS_RESET_STRICT);

  await checkHealth();
  const channel = await createChannel(tile);
  console.log("[limits] channelId", channel.channelId);

  const stages = [];
  let bestStable = null;
  let stoppedReason = null;

  for (let i = 0; i < env.MAX_STAGES; i += 1) {
    const ingestRatePerSec = env.RATE_BASE + env.RATE_STEP * i;
    const streamClients = env.CLIENT_BASE + env.CLIENT_STEP * i;
    if (ingestRatePerSec > env.RATE_MAX || streamClients > env.CLIENT_MAX) break;

    console.log(`\n[limits] stage ${i + 1} start ingest=${ingestRatePerSec}/s clients=${streamClients}`);
    const stage = await runStage({
      stageNo: i + 1,
      ingestRatePerSec,
      streamClients,
      channelId: channel.channelId
    });
    stages.push(stage);

    console.log(
      `[limits] stage ${stage.stageNo} ${stage.passed ? "PASS" : "FAIL"} ` +
        `ingestAccepted=${stage.stageStats.ingestAccepted} streamFrames=${stage.stageStats.streamFrames} ` +
        `dropRate=${stage.stageStats.dropRatePct.toFixed(2)}% metricsP95(stage)=${stage.stageStats.metricsLatencyP95Ms ?? "n/a"}ms ` +
        `metricsP99(stage)=${stage.stageStats.metricsLatencyP99Ms ?? "n/a"}ms ` +
        `clientP95(stage)=${stage.stageStats.clientLatencyP95Ms ?? "n/a"}ms clientP99(stage)=${stage.stageStats.clientLatencyP99Ms ?? "n/a"}ms`
    );
    if (!stage.passed) {
      console.log("[limits] failure reasons:", stage.failureReasons.join("; "));
      stoppedReason = `stage ${stage.stageNo} failed`;
      if (env.STOP_ON_FAILURE) break;
      continue;
    }
    bestStable = {
      stageNo: stage.stageNo,
      ingestRatePerSec: stage.ingestRatePerSec,
      streamClients: stage.streamClients
    };
  }

  if (!stoppedReason) {
    stoppedReason = "finished configured stage range";
  }

  const recommendedCapacity =
    bestStable === null
      ? null
      : {
          sourceStage: bestStable.stageNo,
          headroomPct: 15,
          ingestRatePerSec: Math.max(1, Math.floor(bestStable.ingestRatePerSec * 0.85)),
          streamClients: Math.max(1, Math.floor(bestStable.streamClients * 0.85))
        };

  const output = {
    config: publicConfig(),
    channelId: channel.channelId,
    stoppedReason,
    bestStable,
    recommendedCapacity,
    stages
  };

  console.log("\n[limits] final report");
  console.log(JSON.stringify(output, null, 2));
  if (recommendedCapacity) {
    console.log(
      `[limits] recommended capacity (15% headroom): ingest=${recommendedCapacity.ingestRatePerSec}/s clients=${recommendedCapacity.streamClients} (from stage ${recommendedCapacity.sourceStage})`
    );
  }

  if (env.OUTPUT_FILE) {
    await writeFile(env.OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log("[limits] wrote report:", env.OUTPUT_FILE);
  }
}

main().catch((err) => {
  console.error("[limits] fatal", err);
  process.exit(1);
});
