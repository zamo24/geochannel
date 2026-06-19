import type maplibregl from "maplibre-gl";
import type { AggregateFrame, FeatureCollectionLike, Frame } from "./types";

export function upsertFrameFeature(fc: FeatureCollectionLike, frame: Frame) {
  const [lon, lat] = frame.loc;
  const id = frame.id;
  const feat = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id,
      ts: frame.ts,
      tile: frame.tile,
      speed: (frame.attrs as any)?.speed ?? null
    }
  };
  const idx = fc.features.findIndex((f: any) => f.properties.id === id);
  if (idx >= 0) fc.features[idx] = feat;
  else fc.features.push(feat);
}

export function pruneFeaturesByBoundsAndAge(
  fc: FeatureCollectionLike,
  bounds: maplibregl.LngLatBounds,
  lastSeen: Map<string, number>,
  maxAgeMs: number
) {
  const now = Date.now();
  fc.features = fc.features.filter((feature: any) => {
    const coords = feature?.geometry?.coordinates as [number, number] | undefined;
    if (!coords || coords.length < 2) return false;
    if (!bounds.contains(coords)) return false;
    const id = feature?.properties?.id as string | undefined;
    if (id) {
      const seen = lastSeen.get(id);
      if (seen !== undefined && now - seen > maxAgeMs) return false;
    }
    return true;
  });
}

export function updateLastSeen(lastSeen: Map<string, number>, frame: Frame) {
  const tsMs = Date.parse(frame.ts);
  if (!Number.isFinite(tsMs)) return true;
  const prev = lastSeen.get(frame.id);
  if (prev !== undefined && tsMs <= prev) return false;
  lastSeen.set(frame.id, tsMs);
  return true;
}

function compareStreamOffsets(left: string, right: string) {
  const [leftMs, leftSeq] = left.split("-").map((part) => Number.parseInt(part, 10));
  const [rightMs, rightSeq] = right.split("-").map((part) => Number.parseInt(part, 10));
  if (![leftMs, leftSeq, rightMs, rightSeq].every(Number.isFinite)) return left.localeCompare(right);
  if (leftMs !== rightMs) return leftMs - rightMs;
  return leftSeq - rightSeq;
}

export function upsertAggregateFeature(fc: FeatureCollectionLike, frame: AggregateFrame) {
  const [lon, lat] = frame.loc;
  const idx = fc.features.findIndex((f: any) => f.properties.tile === frame.tile);
  const existing = idx >= 0 ? fc.features[idx] : null;
  const existingWindowStart = existing?.properties?.windowStart as string | undefined;
  const existingOffset = existing?.properties?.offset as string | undefined;
  if (
    frame.windowStart !== undefined &&
    existingWindowStart !== undefined &&
    Date.parse(frame.windowStart) < Date.parse(existingWindowStart)
  ) {
    return;
  }
  if (
    frame.windowStart === existingWindowStart &&
    existingOffset !== undefined &&
    compareStreamOffsets(frame.offset, existingOffset) <= 0
  ) {
    return;
  }
  const sameWindow =
    frame.op === "increment" &&
    frame.windowStart !== undefined &&
    existingWindowStart === frame.windowStart;
  const previousCount = sameWindow ? Number(existing.properties.count ?? 0) : 0;
  const nextCount = previousCount + frame.count;
  const previousCoords = existing?.geometry?.coordinates as [number, number] | undefined;
  const mergedLon = sameWindow && previousCoords ? (previousCoords[0] * previousCount + lon * frame.count) / nextCount : lon;
  const mergedLat = sameWindow && previousCoords ? (previousCoords[1] * previousCount + lat * frame.count) / nextCount : lat;
  const previousAvgSpeed = Number(existing?.properties?.avgSpeed);
  const frameAvgSpeed = Number((frame.attrs as any)?.avgSpeed);
  const mergedAvgSpeed =
    sameWindow && Number.isFinite(previousAvgSpeed) && Number.isFinite(frameAvgSpeed)
      ? (previousAvgSpeed * previousCount + frameAvgSpeed * frame.count) / nextCount
      : Number.isFinite(frameAvgSpeed)
        ? frameAvgSpeed
        : null;
  const feat = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [mergedLon, mergedLat] },
    properties: {
      tile: frame.tile,
      offset: frame.offset,
      ts: frame.ts,
      count: nextCount,
      avgSpeed: mergedAvgSpeed,
      windowStart: frame.windowStart ?? null,
      windowEnd: frame.windowEnd ?? null
    }
  };
  if (idx >= 0) fc.features[idx] = feat;
  else fc.features.push(feat);
}

export function pruneAggregateFeaturesByBoundsAndAge(
  fc: FeatureCollectionLike,
  bounds: maplibregl.LngLatBounds,
  maxAgeMs: number
) {
  const now = Date.now();
  fc.features = fc.features.filter((feature: any) => {
    const coords = feature?.geometry?.coordinates as [number, number] | undefined;
    if (!coords || coords.length < 2) return false;
    if (!bounds.contains(coords)) return false;
    const ts = feature?.properties?.ts as string | undefined;
    if (!ts) return true;
    const tsMs = Date.parse(ts);
    if (!Number.isFinite(tsMs)) return true;
    return now - tsMs <= maxAgeMs;
  });
}
