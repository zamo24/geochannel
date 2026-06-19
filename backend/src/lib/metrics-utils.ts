export type Labels = Record<string, string | number | boolean>;

export const STREAM_LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function normalizeLabels(labels: Labels = {}) {
  const out: Record<string, string> = {};
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) out[key] = value;
  return out;
}

export function labelKey(labels: Record<string, string>) {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

export function labelsText(labels: Record<string, string>) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const rendered = entries.map(([key, value]) => `${key}="${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`);
  return `{${rendered.join(",")}}`;
}

export function addRecentSample(store: Map<number, number>, count: number, nowMs: number, retentionSec = 180) {
  const second = Math.floor(nowMs / 1000);
  store.set(second, (store.get(second) ?? 0) + count);
  const cutoff = second - retentionSec;
  for (const key of store.keys()) {
    if (key < cutoff) store.delete(key);
  }
}

export function recentRate(store: Map<number, number>, windowSec: number, nowMs: number) {
  const second = Math.floor(nowMs / 1000);
  const minSec = second - windowSec + 1;
  let total = 0;
  for (const [bucketSec, count] of store.entries()) {
    if (bucketSec >= minSec) total += count;
  }
  return total / windowSec;
}

export function histogramQuantileFromCumulativeBuckets(bounds: number[], cumulative: number[], quantile: number) {
  if (bounds.length === 0 || cumulative.length === 0 || bounds.length !== cumulative.length) return null;
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
