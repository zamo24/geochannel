import assert from "node:assert/strict";
import test from "node:test";
import * as h3 from "h3-js";
import { STREAM_OFFSET_LIVE, STREAM_OFFSET_REPLAY_START } from "@geochannel/contracts";

const API_BASE = process.env.API_BASE ?? "http://localhost:8081";
const TENANT_ID = process.env.TEST_TENANT_ID ?? "smoke";
const RES = Number.parseInt(process.env.TEST_RES ?? "7", 10);
const INGEST_MAX_EVENTS = Number.parseInt(
  process.env.TEST_INGEST_MAX_EVENTS ?? process.env.INGEST_MAX_EVENTS_PER_REQUEST ?? "1000",
  10
);
const EXPECT_INGEST_AUTH = (process.env.TEST_EXPECT_INGEST_AUTH ?? "").trim() === "1";
const TEST_INGEST_API_KEY = (process.env.TEST_INGEST_API_KEY ?? "").trim();
const EXPECT_TENANT_AUTH = (process.env.TEST_EXPECT_TENANT_AUTH ?? "").trim() === "1";
const TEST_TENANT_API_KEY = (process.env.TEST_TENANT_API_KEY ?? TEST_INGEST_API_KEY).trim();
const EXPECT_STREAM_AUTH = (process.env.TEST_EXPECT_STREAM_AUTH ?? "").trim() === "1";
const EXPECT_METRICS_AUTH = (process.env.TEST_EXPECT_METRICS_AUTH ?? "").trim() === "1";
const TEST_METRICS_AUTH_TOKEN = (process.env.TEST_METRICS_AUTH_TOKEN ?? "").trim();

if (EXPECT_INGEST_AUTH && TEST_INGEST_API_KEY.length === 0) {
  throw new Error("TEST_INGEST_API_KEY is required when TEST_EXPECT_INGEST_AUTH=1");
}
if (EXPECT_TENANT_AUTH && TEST_TENANT_API_KEY.length === 0) {
  throw new Error("TEST_TENANT_API_KEY or TEST_INGEST_API_KEY is required when TEST_EXPECT_TENANT_AUTH=1");
}
if (EXPECT_METRICS_AUTH && TEST_METRICS_AUTH_TOKEN.length === 0) {
  throw new Error("TEST_METRICS_AUTH_TOKEN is required when TEST_EXPECT_METRICS_AUTH=1");
}

const POLYGON = [
  [40.72, -74.01],
  [40.72, -73.95],
  [40.78, -73.95],
  [40.78, -74.01],
  [40.72, -74.01]
];

function apiUrl(path) {
  return new URL(path, API_BASE).toString();
}

async function postJson(path, payload, { headers } = {}) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers ?? {}) },
    body: JSON.stringify(payload)
  });
  return res;
}

async function createChannel(payload) {
  const res = await postJson("/channels", payload, {
    headers: withTenantAuthHeaders()
  });
  const data = await res.json();
  return { res, data };
}

async function mintToken(payload) {
  const res = await postJson("/token", payload, {
    headers: withTenantAuthHeaders()
  });
  const data = await res.json();
  return { res, data };
}

async function ingestEvents(events, opts) {
  const res = await postJson("/ingest/events", events, opts);
  const data = await res.json();
  return { res, data };
}

function withIngestAuthHeaders(headers = {}) {
  if (!EXPECT_INGEST_AUTH) {
    return { "x-tenant-id": TENANT_ID, ...headers };
  }
  return { "x-api-key": TEST_INGEST_API_KEY, ...headers };
}

function withTenantAuthHeaders(headers = {}) {
  if (!EXPECT_TENANT_AUTH) return headers;
  return { "x-api-key": TEST_TENANT_API_KEY, ...headers };
}

async function getStreamAuthHeaders(channelId, tenantId = TENANT_ID) {
  if (!EXPECT_STREAM_AUTH) return {};
  const { res, data } = await mintToken({ channelId, tenantId });
  assert.equal(res.status, 200);
  assert.equal(typeof data?.token, "string");
  return { authorization: `Bearer ${data.token}` };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSseEvent(url, { timeoutMs = 7000, match, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    assert.equal(res.status, 200);
    assert.ok(res.body);
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

        if (!raw || raw.startsWith(":")) {
          idx = buffer.indexOf("\n\n");
          continue;
        }

        const lines = raw.split("\n");
        const dataLine = lines.find((line) => line.startsWith("data:"));
        if (!dataLine) {
          idx = buffer.indexOf("\n\n");
          continue;
        }

        const dataText = dataLine.slice(5).trim();
        if (!dataText) {
          idx = buffer.indexOf("\n\n");
          continue;
        }

        let data;
        try {
          data = JSON.parse(dataText);
        } catch {
          data = dataText;
        }

        if (!data || typeof data !== "object" || data.type !== "event") {
          idx = buffer.indexOf("\n\n");
          continue;
        }

        if (typeof match === "function" && !match(data)) {
          idx = buffer.indexOf("\n\n");
          continue;
        }

        return data;
      }
    }

    throw new Error("No SSE event received.");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

test("health endpoints respond", async () => {
  const health = await fetch(apiUrl("/health"), {
    headers: { "x-request-id": "smoke-health-request" }
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-request-id"), "smoke-health-request");
  const redis = await fetch(apiUrl("/health/redis"));
  assert.equal(redis.status, 200);
});

test("metrics endpoint responds with prometheus payload", async () => {
  const res = await fetch(apiUrl("/metrics"), {
    headers: EXPECT_METRICS_AUTH ? { authorization: `Bearer ${TEST_METRICS_AUTH_TOKEN}` } : undefined
  });
  assert.equal(res.status, 200);
  const contentType = res.headers.get("content-type") ?? "";
  assert.match(contentType, /text\/plain/);
  const body = await res.text();
  assert.match(body, /geochannel_process_uptime_seconds/);
});

test("metrics auth rejects missing token when enabled", { skip: !EXPECT_METRICS_AUTH }, async () => {
  const res = await fetch(apiUrl("/metrics"));
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "METRICS_UNAUTHORIZED");
});

test("create channel from polygon", async () => {
  const { res, data } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  assert.equal(res.status, 200);
  assert.ok(typeof data.channelId === "string" && data.channelId.length > 0);
  assert.ok(data.tilesCount > 0);
});

test("create channel from tiles", async () => {
  const tiles = h3.polygonToCells([POLYGON], RES);
  assert.ok(tiles.length > 0);
  const { res, data } = await createChannel({
    tiles,
    res: RES,
    tenantId: TENANT_ID
  });
  assert.equal(res.status, 200);
  assert.ok(typeof data.channelId === "string" && data.channelId.length > 0);
  assert.ok(data.tilesCount > 0);
});

test("oversized tile expansion is rejected before channel materialization", async () => {
  const parent = h3.latLngToCell(40.7484, -73.9857, 0);
  const { res, data } = await createChannel({
    tiles: [parent],
    res: 9,
    tenantId: TENANT_ID
  });
  assert.equal(res.status, 413);
  assert.equal(data?.error?.code, "CHANNEL_TILE_MATERIALIZATION_LIMIT_EXCEEDED");
});

test("invalid polygon returns 400", async () => {
  const { res, data } = await createChannel({
    polygon: [1, 2],
    res: RES,
    tenantId: TENANT_ID
  });
  assert.equal(res.status, 400);
  assert.equal(typeof data?.error?.code, "string");
  assert.equal(typeof data?.error?.message, "string");
});

test("invalid stream query returns typed validation error", async () => {
  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", "abc123");
  url.searchParams.set("offset", "not-an-offset");
  const res = await fetch(url);
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data?.error?.code, "VALIDATION_ERROR");
});

test("ingest request exceeding max event count is rejected", async () => {
  const events = Array.from({ length: INGEST_MAX_EVENTS + 1 }, (_, i) => ({
    id: `bulk-${Date.now()}-${i}`,
    ts: new Date().toISOString(),
    loc: [-73.9857, 40.7484],
    attrs: { speed: 10 + (i % 20) }
  }));

  const { res, data } = await ingestEvents(events, {
    headers: withIngestAuthHeaders()
  });
  assert.equal(res.status, 413);
  assert.equal(data?.error?.code, "INGEST_EVENT_LIMIT_EXCEEDED");
});

test("ingest tenant header validation when auth is disabled", { skip: EXPECT_INGEST_AUTH }, async () => {
  const payload = [
    {
      id: `tenant-invalid-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484]
    }
  ];
  const { res, data } = await ingestEvents(payload, {
    headers: { "x-tenant-id": "invalid tenant id!" }
  });
  assert.equal(res.status, 400);
  assert.equal(data?.error?.code, "INGEST_TENANT_INVALID");
});

test("ingest auth: missing key returns 401 when enabled", { skip: !EXPECT_INGEST_AUTH }, async () => {
  const payload = [
    {
      id: `auth-missing-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484]
    }
  ];
  const { res, data } = await ingestEvents(payload);
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "INGEST_API_KEY_MISSING");
});

test("ingest auth: invalid key returns 401 when enabled", { skip: !EXPECT_INGEST_AUTH }, async () => {
  const payload = [
    {
      id: `auth-invalid-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484]
    }
  ];
  const { res, data } = await ingestEvents(payload, {
    headers: { "x-api-key": "bad-key" }
  });
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "INGEST_API_KEY_INVALID");
});

test("ingest auth: valid key succeeds when enabled", { skip: !EXPECT_INGEST_AUTH }, async () => {
  const payload = [
    {
      id: `auth-valid-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484]
    }
  ];
  const { res, data } = await ingestEvents(payload, {
    headers: { "x-api-key": TEST_INGEST_API_KEY }
  });
  assert.equal(res.status, 200);
  assert.ok(typeof data?.tenantId === "string" && data.tenantId.length > 0);
});

test("stream auth: missing token returns 401 when enabled", { skip: !EXPECT_STREAM_AUTH }, async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("offset", "$");
  const res = await fetch(url);
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "STREAM_TOKEN_MISSING");
});

test("stream auth: invalid token returns 401 when enabled", { skip: !EXPECT_STREAM_AUTH }, async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("offset", "$");
  const res = await fetch(url, {
    headers: { authorization: "Bearer invalid.token.value" }
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "STREAM_TOKEN_INVALID");
});

test("channel tenant validation rejects invalid tenantId", async () => {
  const { res, data } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: "invalid tenant id!"
  });
  assert.equal(res.status, 400);
  assert.equal(data?.error?.code, "CHANNEL_TENANT_INVALID");
});

test("channel auth: missing key returns 401 when enabled", { skip: !EXPECT_TENANT_AUTH }, async () => {
  const res = await postJson("/channels", {
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "CHANNEL_API_KEY_MISSING");
});

test("channel auth: tenant body mismatch returns 403 when enabled", { skip: !EXPECT_TENANT_AUTH }, async () => {
  const res = await postJson("/channels", {
    polygon: POLYGON,
    res: RES,
    tenantId: "other-tenant"
  }, {
    headers: withTenantAuthHeaders()
  });
  const data = await res.json();
  assert.equal(res.status, 403);
  assert.equal(data?.error?.code, "CHANNEL_TENANT_MISMATCH");
});

test("token tenant validation rejects invalid tenantId", async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const { res, data } = await mintToken({
    channelId: channel.channelId,
    tenantId: "invalid tenant id!"
  });
  assert.equal(res.status, 400);
  assert.equal(data?.error?.code, "TOKEN_TENANT_INVALID");
});

test("token auth: missing key returns 401 when enabled", { skip: !EXPECT_TENANT_AUTH }, async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const res = await postJson("/token", {
    channelId: channel.channelId,
    tenantId: TENANT_ID
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data?.error?.code, "TOKEN_API_KEY_MISSING");
});

test("ingest supports idempotency replay", async () => {
  const idempotencyKey = `idem-replay-${Date.now()}`;
  const payload = [
    {
      id: `idem-asset-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484],
      attrs: { speed: 35 }
    }
  ];

  const first = await ingestEvents(payload, {
    headers: withIngestAuthHeaders({ "idempotency-key": idempotencyKey })
  });
  assert.equal(first.res.status, 200);
  assert.equal(first.data?.idempotencyKey, idempotencyKey);
  assert.equal(first.data?.idempotencyReplay, false);

  const second = await ingestEvents(payload, {
    headers: withIngestAuthHeaders({ "idempotency-key": idempotencyKey })
  });
  assert.equal(second.res.status, 200);
  assert.equal(second.data?.idempotencyKey, idempotencyKey);
  assert.equal(second.data?.idempotencyReplay, true);
  assert.equal(second.data?.accepted, first.data?.accepted);
  assert.equal(second.data?.rejected, first.data?.rejected);
});

test("idempotency key conflict returns 409 for different payload", async () => {
  const idempotencyKey = `idem-conflict-${Date.now()}`;
  const payloadA = [
    {
      id: `idem-a-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484],
      attrs: { speed: 14 }
    }
  ];
  const payloadB = [
    {
      id: `idem-b-${Date.now()}`,
      ts: new Date().toISOString(),
      loc: [-73.98, 40.74],
      attrs: { speed: 55 }
    }
  ];

  const first = await ingestEvents(payloadA, {
    headers: withIngestAuthHeaders({ "idempotency-key": idempotencyKey })
  });
  assert.equal(first.res.status, 200);

  const second = await ingestEvents(payloadB, {
    headers: withIngestAuthHeaders({ "idempotency-key": idempotencyKey })
  });
  assert.equal(second.res.status, 409);
  assert.equal(second.data?.error?.code, "IDEMPOTENCY_KEY_CONFLICT");
});

test("stream replay delivers past events", async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const eventId = `replay-${Date.now()}`;
  const { res: ingestRes } = await ingestEvents([
    {
      id: eventId,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484],
      attrs: { speed: 12 }
    }
  ], {
    headers: withIngestAuthHeaders()
  });
  assert.equal(ingestRes.status, 200);

  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("offset", STREAM_OFFSET_REPLAY_START);
  const headers = await getStreamAuthHeaders(channel.channelId, channel.tenantId ?? TENANT_ID);
  const frame = await readSseEvent(url.toString(), {
    match: (data) => data.id === eventId,
    headers
  });
  assert.equal(frame.id, eventId);
  assert.equal(frame.type, "event");
});

test("stream live delivers new events when offset=$", async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });

  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("offset", STREAM_OFFSET_LIVE);
  const headers = await getStreamAuthHeaders(channel.channelId, channel.tenantId ?? TENANT_ID);

  const eventId = `live-${Date.now()}`;
  const eventPromise = readSseEvent(url.toString(), {
    timeoutMs: 9000,
    match: (data) => data.id === eventId,
    headers
  });
  await sleep(200);

  const { res: ingestRes } = await ingestEvents([
    {
      id: eventId,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484],
      attrs: { speed: 22 }
    }
  ], {
    headers: withIngestAuthHeaders()
  });
  assert.equal(ingestRes.status, 200);

  const frame = await eventPromise;
  assert.equal(frame.id, eventId);
  assert.equal(frame.type, "event");
});

test("stream cursor resumes after the last delivered tile offset", async () => {
  const { data: channel } = await createChannel({
    polygon: POLYGON,
    res: RES,
    tenantId: TENANT_ID
  });
  const cursorId = `smoke-cursor-${Date.now()}`;
  const headers = await getStreamAuthHeaders(channel.channelId, channel.tenantId ?? TENANT_ID);
  const url = new URL(apiUrl("/stream"));
  url.searchParams.set("channelId", channel.channelId);
  url.searchParams.set("offset", STREAM_OFFSET_REPLAY_START);
  url.searchParams.set("cursorId", cursorId);

  const firstId = `cursor-first-${Date.now()}`;
  await ingestEvents([
    {
      id: firstId,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484]
    }
  ], {
    headers: withIngestAuthHeaders()
  });
  const first = await readSseEvent(url.toString(), { match: (data) => data.id === firstId, headers });
  assert.equal(first.id, firstId);
  await sleep(300);

  const secondId = `cursor-second-${Date.now()}`;
  await ingestEvents([
    {
      id: secondId,
      ts: new Date().toISOString(),
      loc: [-73.9857, 40.7484]
    }
  ], {
    headers: withIngestAuthHeaders()
  });
  const resumed = await readSseEvent(url.toString(), { headers });
  assert.equal(resumed.id, secondId);
});
