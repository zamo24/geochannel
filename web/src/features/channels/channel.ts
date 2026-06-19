import type maplibregl from "maplibre-gl";
import { boundsToPolygon, compactTiles, uniqueTilesFromBounds } from "../../lib/h3";

export const TILE_DIRECT_THRESHOLD = 2000;
export const CHANNEL_TIMEOUT_MS = 7000;

export const DEFAULT_MAX_STREAM_TILES = Number(import.meta.env.VITE_MAX_TILES_PER_CHANNEL ?? "5000");
export const DEFAULT_STREAM_RES_MIN = Number(import.meta.env.VITE_H3_RES_STREAM_MIN ?? "0");
export const DEFAULT_STREAM_RES_MAX = Number(import.meta.env.VITE_H3_RES_STREAM_MAX ?? "9");

export function resolutionForZoom(zoom: number) {
  if (zoom >= 14) return 9;
  if (zoom >= 11) return 8;
  if (zoom >= 9) return 7;
  if (zoom >= 7) return 6;
  if (zoom >= 5) return 5;
  if (zoom >= 3) return 4;
  if (zoom >= 1) return 3;
  return 2;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashTiles(input: string[]) {
  let hash = 2166136261;
  for (const tile of input) {
    for (let i = 0; i < tile.length; i += 1) {
      hash ^= tile.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}

export function buildChannelKey(res: number, tiles: string[]) {
  if (tiles.length === 0) return `${res}:empty`;
  const sorted = tiles.slice().sort();
  return `${res}:${tiles.length}:${hashTiles(sorted)}`;
}

export function normalizedStreamRange(streamResMin: number, streamResMax: number) {
  const min = Number.isFinite(streamResMin) ? streamResMin : 0;
  const max = Number.isFinite(streamResMax) ? streamResMax : 9;
  const low = clamp(Math.min(min, max), 0, 15);
  const high = clamp(Math.max(min, max), 0, 15);
  return { low, high };
}

export function computeTilesForViewport(
  bounds: maplibregl.LngLatBounds,
  zoom: number,
  streamResMin: number,
  streamResMax: number,
  maxStreamTiles: number
) {
  const baseRes = resolutionForZoom(zoom);
  const { low, high } = normalizedStreamRange(streamResMin, streamResMax);
  const maxTiles = Number.isFinite(maxStreamTiles) && maxStreamTiles > 0 ? maxStreamTiles : Infinity;

  let res = clamp(baseRes, low, high);
  let tiles = uniqueTilesFromBounds(bounds, res);
  let compacted = compactTiles(tiles);
  while (compacted.length > maxTiles && res > low) {
    res -= 1;
    tiles = uniqueTilesFromBounds(bounds, res);
    compacted = compactTiles(tiles);
  }

  return {
    baseRes,
    res,
    tiles,
    compacted
  };
}

export function buildChannelRequestBody(bounds: maplibregl.LngLatBounds, compacted: string[], res: number) {
  if (compacted.length <= TILE_DIRECT_THRESHOLD) {
    return { tiles: compacted, res };
  }
  return { polygon: boundsToPolygon(bounds), res };
}
