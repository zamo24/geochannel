import { useCallback, useEffect, useMemo, useState } from "react";
import { appendSummaryHistory, EMPTY_HISTORY, EMPTY_SUMMARY, type MetricsHistory } from "./model";
import type { MetricsSummary, MetricsSummaryPayload, TenantModeMetric } from "./types";

const POLL_INTERVAL_MS = 3000;
const METRICS_AUTH_TOKEN = String(import.meta.env.VITE_METRICS_AUTH_TOKEN ?? "").trim();

type MetricsState = {
  loading: boolean;
  error: string | null;
  summary: MetricsSummary;
  history: MetricsHistory;
  byTenantMode: TenantModeMetric[];
  lastUpdatedAt: number | null;
};

export function useMetrics(apiUrl: (path: string) => string) {
  const [state, setState] = useState<MetricsState>({
    loading: true,
    error: null,
    summary: EMPTY_SUMMARY,
    history: EMPTY_HISTORY,
    byTenantMode: [],
    lastUpdatedAt: null
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/metrics/summary"), {
        headers: METRICS_AUTH_TOKEN ? { authorization: `Bearer ${METRICS_AUTH_TOKEN}` } : undefined
      });
      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: `Metrics fetch failed (${res.status}).`
        }));
        return;
      }

      const payload = (await res.json()) as MetricsSummaryPayload;
      const now = Date.now();

      setState((prev) => ({
        loading: false,
        error: null,
        summary: payload.summary,
        byTenantMode: payload.byTenantMode,
        lastUpdatedAt: now,
        history: appendSummaryHistory(prev.history, payload.summary, now)
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Metrics request failed."
      }));
    }
  }, [apiUrl]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const status = useMemo(() => {
    if (state.error) return "error";
    if (state.loading) return "loading";
    return "ok";
  }, [state.error, state.loading]);

  return {
    ...state,
    status,
    refresh
  } as const;
}
