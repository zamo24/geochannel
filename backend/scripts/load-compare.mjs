const API_BASE = process.env.API_BASE ?? "http://localhost:8081";
const DURATION_SEC = Number.parseInt(process.env.BENCH_DURATION_SEC ?? "15", 10);
const CLIENTS_PER_MODE = Number.parseInt(process.env.BENCH_CLIENTS_PER_MODE ?? "2", 10);
const INGEST_RATE_PER_SEC = Number.parseInt(process.env.BENCH_INGEST_RATE_PER_SEC ?? "80", 10);
const INGEST_TICK_MS = Number.parseInt(process.env.BENCH_INGEST_TICK_MS ?? "200", 10);
const INGEST_MAX_IN_FLIGHT = Number.parseInt(process.env.BENCH_INGEST_MAX_IN_FLIGHT ?? "32", 10);
const TENANT_ID = process.env.BENCH_TENANT_ID ?? "bench";
const TENANT_API_KEY = (process.env.BENCH_TENANT_API_KEY ?? process.env.BENCH_INGEST_API_KEY ?? "").trim();
const INGEST_API_KEY = (process.env.BENCH_INGEST_API_KEY ?? "").trim();
const STREAM_AUTH_REQUIRED = ["1", "true", "yes", "on"].includes(
  String(process.env.BENCH_STREAM_AUTH_REQUIRED ?? "").trim().toLowerCase()
);
const STREAM_TOKEN_TTL_SEC = Number.parseInt(process.env.BENCH_STREAM_TOKEN_TTL_SEC ?? "900", 10);
const RAW_RES = Number.parseInt(process.env.BENCH_RAW_RES ?? "8", 10);
const AGG_RES = Number.parseInt(process.env.BENCH_AGG_RES ?? "5", 10);
const TILE = process.env.BENCH_TILE ?? "892a100d2d7ffff";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function jsonHeaders(apiKey, tenantId) {
  return {
    "content-type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : { "x-tenant-id": tenantId })
  };
}

async function postJson(path, body, headers = jsonHeaders("", TENANT_ID)) {
  const res = await fetch(new URL(path, API_BASE).toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return data;
}

async function createChannel(res) {
  return postJson("/channels", {
    tenantId: TENANT_ID,
    tiles: [TILE],
    res
  }, jsonHeaders(TENANT_API_KEY, TENANT_ID));
}

async function mintToken(channelId) {
  return postJson("/token", {
    channelId,
    tenantId: TENANT_ID,
    ttlSec: STREAM_TOKEN_TTL_SEC
  }, jsonHeaders(TENANT_API_KEY, TENANT_ID));
}

function createStats(mode) {
  return {
    mode,
    frames: 0,
    bytes: 0,
    latenciesMs: [],
    parseErrors: 0,
    connectErrors: 0
  };
}

function trackCollector(promise, stats, abortSignal) {
  return promise.catch((err) => {
    if (abortSignal.aborted) return;
    stats.connectErrors += 1;
    console.error(`[${stats.mode}] stream collector failed: ${err.message}`);
  });
}

async function collectSse(channelId, stats, abortSignal, headers) {
  const url = new URL("/stream", API_BASE);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("offset", "$");

  const res = await fetch(url.toString(), { signal: abortSignal, headers });
  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed (${res.status}) for ${stats.mode}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf("\n\n");
    while (idx >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf("\n\n");

      if (!raw || raw.startsWith(":")) continue;
      const line = raw
        .split("\n")
        .find((item) => item.startsWith("data:"));
      if (!line) continue;

      const payloadText = line.slice(5).trim();
      if (!payloadText) continue;

      try {
        const payload = JSON.parse(payloadText);
        if (!payload?.type) continue;
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
      } catch {
        stats.parseErrors += 1;
      }
    }
  }
}

async function runIngestGenerator(untilMs) {
  const tickMs = Math.max(50, INGEST_TICK_MS);
  const batchSize = Math.max(1, Math.round((INGEST_RATE_PER_SEC * tickMs) / 1000));
  const startedAtMs = Date.now();
  let nextTickMs = startedAtMs;
  let seq = 0;
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

    const nowIso = new Date().toISOString();
    const events = Array.from({ length: batchSize }, () => {
      seq += 1;
      return {
        id: `bench-${Date.now()}-${seq}`,
        ts: nowIso,
        loc: [-73.9857, 40.7484],
        attrs: { speed: 20 + (seq % 45) }
      };
    });
    sent += events.length;
    const task = postJson("/ingest/events", events, jsonHeaders(INGEST_API_KEY, TENANT_ID))
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

    if (inFlight.size >= Math.max(1, INGEST_MAX_IN_FLIGHT)) {
      await Promise.race(inFlight);
    }
  }

  await Promise.allSettled(inFlight);
  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  return {
    configuredRatePerSec: INGEST_RATE_PER_SEC,
    achievedSentRatePerSec: sent / elapsedSec,
    achievedAcceptedRatePerSec: accepted / elapsedSec,
    sent,
    accepted,
    failedRequests,
    maxInFlight
  };
}

function summarize(stats, durationSec) {
  return {
    mode: stats.mode,
    frames: stats.frames,
    bytes: stats.bytes,
    kbps: Number(((stats.bytes * 8) / durationSec / 1000).toFixed(2)),
    latencyP50Ms: Number(percentile(stats.latenciesMs, 50).toFixed(2)),
    latencyP95Ms: Number(percentile(stats.latenciesMs, 95).toFixed(2)),
    parseErrors: stats.parseErrors,
    connectErrors: stats.connectErrors
  };
}

async function main() {
  const durationSec = Math.max(5, DURATION_SEC);
  const aggregateChannel = await createChannel(AGG_RES);
  const rawChannel = await createChannel(RAW_RES);

  const aggregateStats = createStats("aggregate");
  const rawStats = createStats("raw");
  const abortController = new AbortController();
  const aggregateStreamHeaders = STREAM_AUTH_REQUIRED
    ? { authorization: `Bearer ${(await mintToken(aggregateChannel.channelId)).token}` }
    : undefined;
  const rawStreamHeaders = STREAM_AUTH_REQUIRED
    ? { authorization: `Bearer ${(await mintToken(rawChannel.channelId)).token}` }
    : undefined;

  const collectors = [];
  for (let i = 0; i < CLIENTS_PER_MODE; i += 1) {
    collectors.push(
      trackCollector(
        collectSse(aggregateChannel.channelId, aggregateStats, abortController.signal, aggregateStreamHeaders),
        aggregateStats,
        abortController.signal
      )
    );
    collectors.push(
      trackCollector(
        collectSse(rawChannel.channelId, rawStats, abortController.signal, rawStreamHeaders),
        rawStats,
        abortController.signal
      )
    );
  }

  await sleep(500);
  const untilMs = Date.now() + durationSec * 1000;
  const ingest = await runIngestGenerator(untilMs);
  await sleep(1000);
  abortController.abort();
  await Promise.allSettled(collectors);

  const aggregateSummary = summarize(aggregateStats, durationSec);
  const rawSummary = summarize(rawStats, durationSec);
  const reduction = rawSummary.kbps > 0
    ? Number((((rawSummary.kbps - aggregateSummary.kbps) / rawSummary.kbps) * 100).toFixed(2))
    : 0;

  console.log("GeoChannel stream benchmark");
  console.log(`API_BASE=${API_BASE}`);
  console.log(`durationSec=${durationSec}, clientsPerMode=${CLIENTS_PER_MODE}, ingestRatePerSec=${INGEST_RATE_PER_SEC}`);
  console.log(`streamAuthRequired=${STREAM_AUTH_REQUIRED}, tenantAuth=${TENANT_API_KEY ? "api-key" : "tenant-id"}, ingestAuth=${INGEST_API_KEY ? "api-key" : "tenant-id"}`);
  console.log(JSON.stringify({ ingest, aggregate: aggregateSummary, raw: rawSummary, bandwidthReductionPct: reduction }, null, 2));

  if (aggregateSummary.connectErrors > 0 || rawSummary.connectErrors > 0 || ingest.failedRequests > 0) {
    throw new Error("stream benchmark completed with connection or ingest errors");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
