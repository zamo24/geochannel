import type { MetricsHistoryKey, MetricsPoint, MetricsSummary, MetricsWindow, TenantModeMetric } from "./types";

const MAX_HISTORY_POINTS = 240;

export type MetricsHistory = Record<MetricsHistoryKey, MetricsPoint[]>;

export const EMPTY_SUMMARY: MetricsSummary = {
  ingestRate1m: 0,
  streamRate1m: 0,
  subscribersCurrent: 0,
  latencyP95Ms: null,
  ingestEventsTotal: 0,
  streamFramesTotal: 0,
  dropsBackpressureTotal: 0,
  dropsInvalidTotal: 0,
  backpressureSignalsTotal: 0
};

export const EMPTY_HISTORY: MetricsHistory = {
  ingestRate1m: [],
  streamRate1m: [],
  subscribersCurrent: [],
  latencyP95Ms: []
};

function pushPoint(points: MetricsPoint[], point: MetricsPoint, maxPoints = MAX_HISTORY_POINTS) {
  const next = points.concat(point);
  return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
}

export function appendSummaryHistory(history: MetricsHistory, summary: MetricsSummary, nowMs: number): MetricsHistory {
  return {
    ingestRate1m: pushPoint(history.ingestRate1m, { ts: nowMs, value: summary.ingestRate1m }),
    streamRate1m: pushPoint(history.streamRate1m, { ts: nowMs, value: summary.streamRate1m }),
    subscribersCurrent: pushPoint(history.subscribersCurrent, { ts: nowMs, value: summary.subscribersCurrent }),
    latencyP95Ms: summary.latencyP95Ms === null
      ? history.latencyP95Ms
      : pushPoint(history.latencyP95Ms, { ts: nowMs, value: summary.latencyP95Ms })
  };
}

export function filterTenantMode(rows: TenantModeMetric[], tenantId: string, mode: string) {
  return rows.filter((row) => {
    if (tenantId !== "all" && row.tenantId !== tenantId) return false;
    if (mode !== "all" && row.mode !== mode) return false;
    return true;
  });
}

export function aggregateTenantMode(rows: TenantModeMetric[]) {
  return rows.reduce(
    (total, row) => {
      total.streamFramesTotal += row.streamFramesTotal;
      total.subscribersCurrent += row.subscribersCurrent;
      total.dropsBackpressureTotal += row.dropsBackpressureTotal;
      total.dropsInvalidTotal += row.dropsInvalidTotal;
      total.backpressureSignalsTotal += row.backpressureSignalsTotal;
      return total;
    },
    {
      streamFramesTotal: 0,
      subscribersCurrent: 0,
      dropsBackpressureTotal: 0,
      dropsInvalidTotal: 0,
      backpressureSignalsTotal: 0
    }
  );
}

export function windowMsFor(windowKey: MetricsWindow) {
  if (windowKey === "1m") return 60_000;
  if (windowKey === "5m") return 5 * 60_000;
  if (windowKey === "15m") return 15 * 60_000;
  return null;
}

export function applyWindow(points: MetricsPoint[], nowMs: number, windowKey: MetricsWindow) {
  const windowMs = windowMsFor(windowKey);
  if (windowMs === null) return points;
  const minTs = nowMs - windowMs;
  return points.filter((point) => point.ts >= minTs);
}
