import { STREAM_FRAME_TYPE_AGGREGATE, type StreamAggregateFrame } from "@geochannel/contracts";
import { buildEntry, tileFromStreamKey } from "./stream.js";

export type RedisStreamEntry = [string, string[]];

export function shouldAggregateByRes(res: number, maxAggregateRes: number) {
  return Number.isFinite(maxAggregateRes) && maxAggregateRes >= 0 && res <= maxAggregateRes;
}

export function thinEntries(entries: RedisStreamEntry[], maxPerRead: number) {
  if (!Number.isFinite(maxPerRead) || maxPerRead <= 0) return entries;
  if (entries.length <= maxPerRead) return entries;
  return entries.slice(entries.length - maxPerRead);
}

function buildAggregateFrameForWindow(
  streamKey: string,
  entries: RedisStreamEntry[],
  windowStartMs?: number,
  windowMs?: number
): StreamAggregateFrame | null {
  let count = 0;
  let sumLon = 0;
  let sumLat = 0;
  let speedCount = 0;
  let speedSum = 0;
  let offset = "";
  let ts = "";
  let tsMsMax = -Infinity;
  let tile = tileFromStreamKey(streamKey);

  for (const [id, fields] of entries) {
    offset = id;
    const data = buildEntry(fields);
    const lon = Number.parseFloat(data.lon ?? "");
    const lat = Number.parseFloat(data.lat ?? "");
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    tile = data.cell ?? data.tile ?? tile;
    count += 1;
    sumLon += lon;
    sumLat += lat;

    const parsedTsMs = Date.parse(data.ts ?? "");
    if (Number.isFinite(parsedTsMs) && parsedTsMs >= tsMsMax) {
      tsMsMax = parsedTsMs;
      ts = new Date(parsedTsMs).toISOString();
    }

    if (data.attrs) {
      try {
        const attrs = JSON.parse(data.attrs) as Record<string, unknown>;
        const speed = typeof attrs.speed === "number" ? attrs.speed : Number.parseFloat(String(attrs.speed));
        if (Number.isFinite(speed)) {
          speedCount += 1;
          speedSum += speed;
        }
      } catch {
        // Ignore invalid attrs payloads in aggregation mode.
      }
    }
  }

  if (count === 0 || offset.length === 0) return null;
  const attrs =
    speedCount > 0
      ? {
          avgSpeed: Number((speedSum / speedCount).toFixed(2))
        }
      : undefined;

  return {
    type: STREAM_FRAME_TYPE_AGGREGATE,
    op: "increment",
    offset,
    tile,
    ts: ts || new Date().toISOString(),
    loc: [sumLon / count, sumLat / count],
    count,
    windowStart: windowStartMs === undefined ? undefined : new Date(windowStartMs).toISOString(),
    windowEnd:
      windowStartMs === undefined || windowMs === undefined ? undefined : new Date(windowStartMs + windowMs).toISOString(),
    attrs
  };
}

export function buildAggregateFrame(streamKey: string, entries: RedisStreamEntry[]): StreamAggregateFrame | null {
  return buildAggregateFrameForWindow(streamKey, entries);
}

export function buildAggregateFrames(streamKey: string, entries: RedisStreamEntry[], windowMs: number) {
  const safeWindowMs = Math.max(1, Math.floor(windowMs));
  const byWindow = new Map<number, RedisStreamEntry[]>();
  for (const entry of entries) {
    const data = buildEntry(entry[1]);
    const tsMs = Date.parse(data.ts ?? "");
    const offsetMs = Number.parseInt(entry[0].split("-")[0] ?? "", 10);
    const eventMs = Number.isFinite(tsMs) ? tsMs : offsetMs;
    const windowStartMs = Math.floor(eventMs / safeWindowMs) * safeWindowMs;
    const group = byWindow.get(windowStartMs);
    if (group) group.push(entry);
    else byWindow.set(windowStartMs, [entry]);
  }
  return Array.from(byWindow.entries())
    .sort(([a], [b]) => a - b)
    .map(([windowStartMs, group]) => buildAggregateFrameForWindow(streamKey, group, windowStartMs, safeWindowMs))
    .filter((frame): frame is StreamAggregateFrame => frame !== null);
}
