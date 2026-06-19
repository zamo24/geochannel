import * as h3 from "h3-js";
import { randomBytes } from "node:crypto";
import { env } from "../config.js";
import type { IngestEvent } from "../types.js";
import { clampNumber, coerceInt } from "./scalars.js";

export const H3_MIN_RES = 0;
export const H3_MAX_RES = 15;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function coerceRes(input: unknown, fallback: number) {
  const value = coerceInt(input, fallback);
  return clampNumber(value, H3_MIN_RES, H3_MAX_RES);
}

export function clampResToStreamRange(value: number) {
  const minRes = Math.min(env.H3_RES_STREAM_MIN, env.H3_RES_STREAM_MAX);
  const maxRes = Math.max(env.H3_RES_STREAM_MIN, env.H3_RES_STREAM_MAX);
  return clampNumber(value, minRes, maxRes);
}

export function getStreamResBounds() {
  const minRes = Math.min(env.H3_RES_STREAM_MIN, env.H3_RES_STREAM_MAX);
  const maxRes = Math.max(env.H3_RES_STREAM_MIN, env.H3_RES_STREAM_MAX);
  return {
    min: clampNumber(minRes, H3_MIN_RES, env.H3_RES_INGEST),
    max: clampNumber(maxRes, H3_MIN_RES, env.H3_RES_INGEST)
  };
}

export function coerceTtl(input: unknown, fallback: number) {
  const value = coerceInt(input, fallback);
  return clampNumber(value, env.CHANNEL_TTL_MIN_SEC, env.CHANNEL_TTL_MAX_SEC);
}

export function parseEvent(input: unknown): IngestEvent | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.length === 0) return null;
  if (typeof obj.ts !== "string" || Number.isNaN(Date.parse(obj.ts))) return null;

  const loc = obj.loc as unknown;
  if (!Array.isArray(loc) || loc.length !== 2) return null;
  const [lon, lat] = loc;
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) return null;

  if (obj.attrs && typeof obj.attrs !== "object") return null;

  return {
    id: obj.id,
    ts: obj.ts,
    loc: [lon, lat],
    attrs: (obj.attrs as Record<string, unknown>) ?? undefined
  };
}

export function parseTiles(
  input: unknown
):
  | { ok: true; tiles: string[]; resMin: number; resMax: number }
  | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "tiles must be a non-empty array of H3 cell strings." };
  }

  const tiles: string[] = [];
  let resMin = Infinity;
  let resMax = -Infinity;

  for (let i = 0; i < input.length; i += 1) {
    const tile = input[i];
    if (typeof tile !== "string" || tile.trim().length === 0) {
      return { ok: false, error: "tiles must contain non-empty strings." };
    }
    if (!h3.isValidCell(tile)) {
      return { ok: false, error: `tiles contains an invalid H3 cell at index ${i}.` };
    }
    const tileRes = h3.getResolution(tile);
    resMin = Math.min(resMin, tileRes);
    resMax = Math.max(resMax, tileRes);
    tiles.push(tile);
  }

  const unique = Array.from(new Set(tiles));
  if (unique.length === 0) {
    return { ok: false, error: "tiles must contain at least one valid H3 cell." };
  }
  return { ok: true, tiles: unique, resMin, resMax };
}

export function parsePolygon(
  input: unknown,
  maxPoints: number
):
  | { ok: true; ring: [number, number][] }
  | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "polygon must be an array of [lat,lng] points." };
  }
  if (input.length < 3) {
    return { ok: false, error: "polygon must have at least 3 points." };
  }
  if (input.length > maxPoints) {
    return { ok: false, error: `polygon exceeds max points (${maxPoints}).` };
  }

  const ring: [number, number][] = [];
  for (let i = 0; i < input.length; i += 1) {
    const point = input[i];
    if (!Array.isArray(point) || point.length !== 2) {
      return { ok: false, error: "polygon points must be [lat,lng] pairs." };
    }
    const [lat, lng] = point;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return { ok: false, error: "polygon points must be finite numbers." };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, error: `polygon point out of range at index ${i}.` };
    }
    ring.push([lat, lng]);
  }

  const [firstLat, firstLng] = ring[0];
  const [lastLat, lastLng] = ring[ring.length - 1];
  if (firstLat !== lastLat || firstLng !== lastLng) {
    ring.push([firstLat, firstLng]);
  }

  return { ok: true, ring };
}

export function generateChannelId() {
  return randomBytes(8).toString("base64url");
}

export function normalizeTilesToRes(
  tiles: string[],
  targetRes: number
):
  | { ok: true; tiles: string[] }
  | { ok: false; error: string } {
  const normalized = new Set<string>();

  try {
    for (const tile of tiles) {
      const tileRes = h3.getResolution(tile);
      if (tileRes === targetRes) {
        normalized.add(tile);
        continue;
      }
      if (tileRes < targetRes) {
        const expanded = h3.uncompactCells([tile], targetRes);
        for (const child of expanded) normalized.add(child);
        continue;
      }
      normalized.add(h3.cellToParent(tile, targetRes));
    }
  } catch {
    return { ok: false, error: `Failed to normalize tiles to res ${targetRes}.` };
  }

  return { ok: true, tiles: Array.from(normalized) };
}

export function estimateNormalizedTileCountUpperBound(tiles: string[], targetRes: number) {
  let total = 0;
  for (const tile of tiles) {
    const tileRes = h3.getResolution(tile);
    total += tileRes < targetRes ? h3.cellToChildrenSize(tile, targetRes) : 1;
    if (!Number.isSafeInteger(total)) return Number.POSITIVE_INFINITY;
  }
  return total;
}

export function estimatePolygonCellMaterialization(ring: [number, number][], targetRes: number) {
  if (ring.length === 0) return 0;

  let latMin = 90;
  let latMax = -90;
  let lngMin = 180;
  let lngMax = -180;
  for (const [lat, lng] of ring) {
    latMin = Math.min(latMin, lat);
    latMax = Math.max(latMax, lat);
    lngMin = Math.min(lngMin, lng);
    lngMax = Math.max(lngMax, lng);
  }

  const toRadians = Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const latSpanRad = Math.max(0, latMax - latMin) * toRadians;
  const rawLngSpan = Math.max(0, lngMax - lngMin);
  const lngSpanRad = Math.min(rawLngSpan, 360 - rawLngSpan) * toRadians;
  const areaKm2 =
    earthRadiusKm *
    earthRadiusKm *
    Math.abs(Math.sin(latMax * toRadians) - Math.sin(latMin * toRadians)) *
    lngSpanRad;
  const midLatRad = ((latMin + latMax) / 2) * toRadians;
  const widthKm = earthRadiusKm * lngSpanRad * Math.max(0.01, Math.cos(midLatRad));
  const heightKm = earthRadiusKm * latSpanRad;
  const perimeterKm = 2 * (widthKm + heightKm);
  const averageAreaKm2 = h3.getHexagonAreaAvg(targetRes, h3.UNITS.km2);
  const averageEdgeKm = h3.getHexagonEdgeLengthAvg(targetRes, h3.UNITS.km);

  // Bounding-box area plus a broad boundary allowance keeps H3 allocation
  // bounded before polygonToCells performs its own internal materialization.
  return Math.ceil((areaKm2 / averageAreaKm2) * 4 + (perimeterKm / averageEdgeKm) * 4 + ring.length * 2);
}
