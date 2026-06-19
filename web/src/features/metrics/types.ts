export type MetricsSummary = {
  ingestRate1m: number;
  streamRate1m: number;
  subscribersCurrent: number;
  latencyP95Ms: number | null;
  ingestEventsTotal: number;
  streamFramesTotal: number;
  dropsBackpressureTotal: number;
  dropsInvalidTotal: number;
  backpressureSignalsTotal: number;
};

export type MetricsHistoryKey = "ingestRate1m" | "streamRate1m" | "subscribersCurrent" | "latencyP95Ms";

export type MetricsPoint = {
  ts: number;
  value: number;
};

export type TenantModeMetric = {
  tenantId: string;
  mode: string;
  streamFramesTotal: number;
  subscribersCurrent: number;
  dropsBackpressureTotal: number;
  dropsInvalidTotal: number;
  backpressureSignalsTotal: number;
};

export type MetricsSummaryPayload = {
  status: "ok";
  generatedAt: string;
  process: {
    startedAtSec: number;
    uptimeSec: number;
  };
  summary: MetricsSummary;
  byTenantMode: TenantModeMetric[];
};

export type MetricsWindow = "1m" | "5m" | "15m" | "all";
