export type MetricsSummary = {
  ingestRate1m: number;
  streamRate1m: number;
  subscribersCurrent: number;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  ingestEventsTotal: number;
  streamFramesTotal: number;
  dropsBackpressureTotal: number;
  dropsInvalidTotal: number;
  backpressureSignalsTotal: number;
};

export type MetricsTenantMode = {
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
  window: {
    resetAtSec: number;
    sinceResetSec: number;
    generation: number;
  };
  summary: MetricsSummary;
  latencyHistogram: {
    boundsMs: number[];
    cumulative: number[];
    sampleCount: number;
    sumMs: number;
  };
  byTenantMode: MetricsTenantMode[];
};
