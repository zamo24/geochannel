import { expect, test, type Page } from "@playwright/test";
import * as h3 from "h3-js";

const API_BASE = "http://localhost:8081";
const TENANT_ID = "pilot";
const TENANT_API_KEY = "tenant-key";
const INGEST_API_KEY = "ingest-key";
const CENTER = { lat: 40.7484, lon: -73.9857 };
const AGGREGATE_CENTER = { lat: 34.0522, lon: -118.2437 };
const RAW_TILE = h3.latLngToCell(CENTER.lat, CENTER.lon, 8);
const AGGREGATE_TILE = h3.latLngToCell(AGGREGATE_CENTER.lat, AGGREGATE_CENTER.lon, 5);

type ChannelSession = {
  channelId: string;
  token: string;
};

async function browserPost(
  page: Page,
  path: string,
  body: unknown,
  apiKey: string
) {
  return page.evaluate(async ({ apiBase, path, body, apiKey }) => {
    const response = await fetch(new URL(path, apiBase), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    return { status: response.status, payload };
  }, { apiBase: API_BASE, path, body, apiKey });
}

async function createChannelSession(page: Page, tile: string, res: number, tokenTtlSec = 30): Promise<ChannelSession> {
  const channel = await browserPost(page, "/channels", {
    tenantId: TENANT_ID,
    tiles: [tile],
    res
  }, TENANT_API_KEY);
  expect(channel.status).toBe(200);
  expect(typeof channel.payload.channelId).toBe("string");

  const token = await browserPost(page, "/token", {
    tenantId: TENANT_ID,
    channelId: channel.payload.channelId,
    ttlSec: tokenTtlSec
  }, TENANT_API_KEY);
  expect(token.status).toBe(200);
  expect(typeof token.payload.token).toBe("string");
  return { channelId: channel.payload.channelId, token: token.payload.token };
}

async function ingest(page: Page, events: unknown[]) {
  const result = await browserPost(page, "/ingest/events", events, INGEST_API_KEY);
  expect(result.status).toBe(200);
  expect(result.payload.accepted).toBe(events.length);
}

async function readFrame(
  page: Page,
  input: {
    channelId: string;
    token: string;
    offset: string;
    cursorId?: string;
    matchType: "event" | "aggregate";
    matchId?: string;
    liveEvent?: unknown;
  }
) {
  return page.evaluate(async ({ apiBase, ingestApiKey, input }) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort("timeout"), 10_000);
    const url = new URL("/stream", apiBase);
    url.searchParams.set("channelId", input.channelId);
    url.searchParams.set("offset", input.offset);
    if (input.cursorId) url.searchParams.set("cursorId", input.cursorId);

    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${input.token}` },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`stream failed (${response.status}): ${await response.text()}`);
      }

      if (input.liveEvent) {
        const ingestResponse = await fetch(new URL("/ingest/events", apiBase), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": ingestApiKey
          },
          body: JSON.stringify([input.liveEvent])
        });
        if (!ingestResponse.ok) throw new Error(`live ingest failed (${ingestResponse.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) throw new Error("stream closed before matching frame");
        buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
          const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const frame = JSON.parse(dataLine.slice("data:".length).trim());
          if (frame?.type !== input.matchType) continue;
          if (input.matchId && frame?.id !== input.matchId) continue;
          controller.abort("matched");
          return frame;
        }
      }
    } finally {
      window.clearTimeout(timer);
      controller.abort();
    }
  }, { apiBase: API_BASE, ingestApiKey: INGEST_API_KEY, input });
}

function event(id: string, center = CENTER) {
  return {
    id,
    ts: new Date().toISOString(),
    loc: [center.lon, center.lat],
    attrs: { speed: 24 }
  };
}

test.describe.serial("secured browser workflow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "GeoChannel Demo" })).toBeVisible();
  });

  test("delivers replay, live updates, and cursor-based reconnects", async ({ page }) => {
    const session = await createChannelSession(page, RAW_TILE, 8);
    const cursorId = `e2e-${Date.now()}`;
    const replayEvent = event(`e2e-replay-${Date.now()}`);
    await ingest(page, [replayEvent]);

    const replayFrame = await readFrame(page, {
      ...session,
      offset: "0-0",
      cursorId,
      matchType: "event",
      matchId: replayEvent.id
    });
    expect(replayFrame.id).toBe(replayEvent.id);

    await page.waitForTimeout(300);
    const resumedEvent = event(`e2e-resume-${Date.now()}`);
    await ingest(page, [resumedEvent]);
    const resumedFrame = await readFrame(page, {
      ...session,
      offset: "0-0",
      cursorId,
      matchType: "event",
      matchId: resumedEvent.id
    });
    expect(resumedFrame.id).toBe(resumedEvent.id);

    const liveEvent = event(`e2e-live-${Date.now()}`);
    const liveFrame = await readFrame(page, {
      ...session,
      offset: "$",
      matchType: "event",
      matchId: liveEvent.id,
      liveEvent
    });
    expect(liveFrame.id).toBe(liveEvent.id);
  });

  test("switches broad views to aggregate frames", async ({ page }) => {
    const session = await createChannelSession(page, AGGREGATE_TILE, 5);
    await ingest(page, [
      event(`e2e-aggregate-a-${Date.now()}`, AGGREGATE_CENTER),
      event(`e2e-aggregate-b-${Date.now()}`, AGGREGATE_CENTER)
    ]);

    const frame = await readFrame(page, {
      ...session,
      offset: "0-0",
      matchType: "aggregate"
    });
    expect(frame.type).toBe("aggregate");
    expect(frame.count).toBeGreaterThanOrEqual(2);
  });

  test("rejects expired stream tokens", async ({ page }) => {
    const session = await createChannelSession(page, RAW_TILE, 8, 1);
    await page.waitForTimeout(2_000);
    const result = await page.evaluate(async ({ apiBase, session }) => {
      const url = new URL("/stream", apiBase);
      url.searchParams.set("channelId", session.channelId);
      url.searchParams.set("offset", "$");
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${session.token}` }
      });
      return { status: response.status, payload: await response.json() };
    }, { apiBase: API_BASE, session });

    expect(result.status).toBe(401);
    expect(result.payload.error.code).toBe("STREAM_TOKEN_EXPIRED");
  });
});
