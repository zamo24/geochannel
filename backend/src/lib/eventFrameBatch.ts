import { STREAM_FRAME_TYPE_EVENT, type StreamEventFrame } from "@geochannel/contracts";
import type { QueuedSseFrame } from "./framePump.js";
import { buildEntry, tileFromStreamKey } from "./stream.js";
import type { RedisStreamEntry } from "./aggregation.js";

function parseTimestampMs(ts: string | undefined) {
  if (!ts) return null;
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOffsetTimestampMs(offset: string) {
  const parsed = Number.parseInt(offset.split("-")[0] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAttrs(raw: string | undefined) {
  if (!raw || raw.length === 0 || raw === "{}") return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function eventPayloadFromBase(offset: string, payloadBase: string) {
  if (payloadBase.length < 2 || payloadBase[0] !== "{") return null;
  return `{"type":"event","offset":${JSON.stringify(offset)},${payloadBase.slice(1)}`;
}

export function buildEventFrameBatches(
  streamKey: string,
  entries: RedisStreamEntry[],
  options: { includeAttrs: boolean; maxFrames: number; maxBytes: number }
) {
  const frames: QueuedSseFrame[] = [];
  const payloadParts: string[] = [];
  let frameCount = 0;
  let payloadBytes = 0;
  let latestTsMs: number | null = null;
  let cursorTile: string | undefined;
  let cursorOffset: string | undefined;
  let invalidCount = 0;

  const flush = () => {
    if (frameCount === 0) return;
    frames.push({
      payload: payloadParts.join(""),
      mode: "event",
      frameCount,
      tsMs: latestTsMs,
      sizeBytes: payloadBytes,
      cursorTile,
      cursorOffset
    });
    payloadParts.length = 0;
    frameCount = 0;
    payloadBytes = 0;
    latestTsMs = null;
  };

  for (const [id, fields] of entries) {
    const data = buildEntry(fields);
    const tile = data.cell ?? data.tile ?? tileFromStreamKey(streamKey);
    const payloadBase = options.includeAttrs ? data.p : undefined;
    let payloadJson = payloadBase ? eventPayloadFromBase(id, payloadBase) : null;
    if (!payloadJson) {
      const lon = Number.parseFloat(data.lon ?? "");
      const lat = Number.parseFloat(data.lat ?? "");
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        invalidCount += 1;
        continue;
      }
      const frame: StreamEventFrame = {
        type: STREAM_FRAME_TYPE_EVENT,
        offset: id,
        tile,
        ts: data.ts ?? new Date().toISOString(),
        id: data.id ?? "",
        loc: [lon, lat]
      };
      if (options.includeAttrs) frame.attrs = parseAttrs(data.attrs);
      payloadJson = JSON.stringify(frame);
    }

    const eventPayload = `data: ${payloadJson}\n\n`;
    const eventPayloadBytes = Buffer.byteLength(eventPayload, "utf8");
    const exceedsFrames = options.maxFrames > 0 && frameCount + 1 > options.maxFrames;
    const exceedsBytes = options.maxBytes > 0 && payloadBytes + eventPayloadBytes > options.maxBytes;
    if (frameCount > 0 && (exceedsFrames || exceedsBytes)) flush();

    payloadParts.push(eventPayload);
    frameCount += 1;
    payloadBytes += eventPayloadBytes;
    latestTsMs = parseOffsetTimestampMs(id) ?? parseTimestampMs(data.ts) ?? latestTsMs;
    cursorTile = tile;
    cursorOffset = id;
  }
  flush();
  return { frames, invalidCount };
}
