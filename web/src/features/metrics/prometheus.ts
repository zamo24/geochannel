export type MetricLabels = Record<string, string>;

export type MetricSample = {
  name: string;
  labels: MetricLabels;
  value: number;
};

function parseLabels(raw: string) {
  const labels: MetricLabels = {};
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null = regex.exec(raw);
  while (match) {
    labels[match[1]] = match[2].replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
    match = regex.exec(raw);
  }
  return labels;
}

function parseNameAndLabels(input: string) {
  const open = input.indexOf("{");
  if (open < 0) {
    return {
      name: input,
      labels: {} as MetricLabels
    };
  }
  const close = input.lastIndexOf("}");
  if (close < open) {
    return {
      name: input,
      labels: {} as MetricLabels
    };
  }
  return {
    name: input.slice(0, open),
    labels: parseLabels(input.slice(open + 1, close))
  };
}

export function parsePrometheusText(text: string) {
  const samples: MetricSample[] = [];
  const lines = text.split("\n");
  const lineRegex = /^(\S+)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?|NaN|[+-]Inf)(?:\s+\d+)?$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = lineRegex.exec(trimmed);
    if (!match) continue;
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    const parsed = parseNameAndLabels(match[1]);
    samples.push({
      name: parsed.name,
      labels: parsed.labels,
      value
    });
  }

  return samples;
}

export function sumMetric(samples: MetricSample[], name: string, predicate?: (sample: MetricSample) => boolean) {
  return samples.reduce((total, sample) => {
    if (sample.name !== name) return total;
    if (predicate && !predicate(sample)) return total;
    return total + sample.value;
  }, 0);
}

export function histogramQuantile(samples: MetricSample[], histogramBaseName: string, quantile: number) {
  const buckets = new Map<number, number>();
  for (const sample of samples) {
    if (sample.name !== `${histogramBaseName}_bucket`) continue;
    const le = sample.labels.le;
    if (!le) continue;
    const bound = le === "+Inf" ? Number.POSITIVE_INFINITY : Number(le);
    if (!Number.isFinite(bound) && bound !== Number.POSITIVE_INFINITY) continue;
    buckets.set(bound, (buckets.get(bound) ?? 0) + sample.value);
  }
  if (buckets.size === 0) return null;

  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b);
  const total = sorted[sorted.length - 1][1];
  if (total <= 0) return null;

  const target = quantile * total;
  let prevLe = 0;
  let prevCount = 0;

  for (const [le, cumulativeCount] of sorted) {
    if (cumulativeCount < target) {
      prevLe = Number.isFinite(le) ? le : prevLe;
      prevCount = cumulativeCount;
      continue;
    }
    if (!Number.isFinite(le)) return prevLe || null;
    const bucketCount = Math.max(cumulativeCount - prevCount, 0);
    if (bucketCount === 0) return le;
    const inBucket = (target - prevCount) / bucketCount;
    return prevLe + (le - prevLe) * inBucket;
  }

  const [lastLe] = sorted[sorted.length - 1];
  return Number.isFinite(lastLe) ? lastLe : prevLe || null;
}
