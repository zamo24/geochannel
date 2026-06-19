import type maplibregl from "maplibre-gl";

export const DEMO_GEN_RATE_MS = 1000;
export const DEMO_GEN_BATCH = 25;
export const DEMO_GEN_ASSETS = 200;

export type DemoEvent = {
  id: string;
  ts: string;
  loc: [number, number];
  attrs: Record<string, unknown>;
};

export function ensureDemoAssets(assets: string[], count: number = DEMO_GEN_ASSETS) {
  if (assets.length > 0) return assets;
  return Array.from({ length: count }, (_, i) => `asset-${i + 1}`);
}

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function buildDemoBatch(bounds: maplibregl.LngLatBounds, assets: string[], batchSize: number = DEMO_GEN_BATCH) {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const pool = assets.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const batch: DemoEvent[] = [];
  for (let i = 0; i < batchSize; i += 1) {
    const id = pool[i % pool.length];
    const lon = randomInRange(sw.lng, ne.lng);
    const lat = randomInRange(sw.lat, ne.lat);
    batch.push({
      id,
      ts: new Date().toISOString(),
      loc: [lon, lat],
      attrs: {
        speed: Math.round(Math.random() * 80),
        heading: Math.round(Math.random() * 360)
      }
    });
  }

  return batch;
}
