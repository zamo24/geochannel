import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { aggregateTenantMode, applyWindow, filterTenantMode } from "./model";
import { Sparkline } from "./Sparkline";
import { TimeSeriesChart } from "./TimeSeriesChart";
import type { MetricsWindow } from "./types";
import { useMetrics } from "./useMetrics";

type MetricsDashboardProps = {
  apiUrl: (path: string) => string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatTimestamp(ts: number | null) {
  if (!ts) return "never";
  return new Date(ts).toLocaleTimeString();
}

function formatShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(1);
}

function windowLabel(windowKey: MetricsWindow) {
  if (windowKey === "1m") return "1 minute";
  if (windowKey === "5m") return "5 minutes";
  if (windowKey === "15m") return "15 minutes";
  return "all samples";
}

function StatusBadge({ status }: { status: "ok" | "loading" | "error" }) {
  if (status === "ok") return <Badge variant="success">Healthy</Badge>;
  if (status === "loading") return <Badge variant="secondary">Loading</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

function MetricCard(props: { title: string; value: string; hint: string; values: number[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-semibold tracking-tight">{props.value}</div>
        <Sparkline values={props.values} />
      </CardContent>
    </Card>
  );
}

export function MetricsDashboard({ apiUrl }: MetricsDashboardProps) {
  const { byTenantMode, error, history, lastUpdatedAt, refresh, status, summary } = useMetrics(apiUrl);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState<MetricsWindow>("5m");

  const tenantOptions = useMemo(() => {
    const unique = Array.from(new Set(byTenantMode.map((row) => row.tenantId))).sort((a, b) => a.localeCompare(b));
    return ["all", ...unique];
  }, [byTenantMode]);

  const modeOptions = useMemo(() => {
    const unique = Array.from(new Set(byTenantMode.map((row) => row.mode))).sort((a, b) => a.localeCompare(b));
    return ["all", ...unique];
  }, [byTenantMode]);

  const filteredRows = useMemo(
    () => filterTenantMode(byTenantMode, tenantFilter, modeFilter),
    [byTenantMode, modeFilter, tenantFilter]
  );
  const filteredTotals = useMemo(() => aggregateTenantMode(filteredRows), [filteredRows]);
  const now = Date.now();
  const windowedHistory = useMemo(
    () => ({
      ingestRate1m: applyWindow(history.ingestRate1m, now, windowFilter),
      streamRate1m: applyWindow(history.streamRate1m, now, windowFilter),
      subscribersCurrent: applyWindow(history.subscribersCurrent, now, windowFilter),
      latencyP95Ms: applyWindow(history.latencyP95Ms, now, windowFilter)
    }),
    [history.ingestRate1m, history.latencyP95Ms, history.streamRate1m, history.subscribersCurrent, now, windowFilter]
  );

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">GeoChannel Metrics Dashboard</CardTitle>
              <CardDescription>
                Polling <code className="rounded bg-muted px-1 py-0.5 text-xs">/metrics/summary</code> every 3 seconds.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>Last updated: {formatTimestamp(lastUpdatedAt)}</span>
            <span>Window: {windowLabel(windowFilter)}</span>
            {error ? <span>{error}</span> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Filters</CardTitle>
            <CardDescription>Tenant/mode filtering applies to stream totals and tenant table.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="tenant-filter">
                Tenant
              </label>
              <Select id="tenant-filter" value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)}>
                {tenantOptions.map((tenant) => (
                  <option key={tenant} value={tenant}>
                    {tenant === "all" ? "All tenants" : tenant}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="mode-filter">
                Mode
              </label>
              <Select id="mode-filter" value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
                {modeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "all" ? "All modes" : mode}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="window-filter">
                Chart window
              </label>
              <Select
                id="window-filter"
                value={windowFilter}
                onChange={(event) => setWindowFilter(event.target.value as MetricsWindow)}
              >
                <option value="1m">Last 1 minute</option>
                <option value="5m">Last 5 minutes</option>
                <option value="15m">Last 15 minutes</option>
                <option value="all">All samples</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tenant">Tenant / Mode</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Ingest Rate (1m)"
                value={`${formatNumber(summary.ingestRate1m)} eps`}
                hint="Global accepted events per second"
                values={windowedHistory.ingestRate1m.map((item) => item.value)}
              />
              <MetricCard
                title="Stream Rate (1m)"
                value={`${formatNumber(summary.streamRate1m)} fps`}
                hint="Global frames sent per second"
                values={windowedHistory.streamRate1m.map((item) => item.value)}
              />
              <MetricCard
                title="Subscribers"
                value={formatNumber(summary.subscribersCurrent)}
                hint="Global active stream subscribers"
                values={windowedHistory.subscribersCurrent.map((item) => item.value)}
              />
              <MetricCard
                title="Stream Latency P95"
                value={summary.latencyP95Ms === null ? "n/a" : `${formatNumber(summary.latencyP95Ms)} ms`}
                hint="Computed server-side from histogram buckets"
                values={windowedHistory.latencyP95Ms.map((item) => item.value)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Rate Trends</CardTitle>
                <CardDescription>Ingest and stream rates over {windowLabel(windowFilter)}.</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  yFormatter={formatShort}
                  series={[
                    {
                      name: "Ingest rate (eps)",
                      colorClassName: "stroke-blue-600",
                      points: windowedHistory.ingestRate1m
                    },
                    {
                      name: "Stream rate (fps)",
                      colorClassName: "stroke-emerald-600",
                      points: windowedHistory.streamRate1m
                    }
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stream Health Trends</CardTitle>
                <CardDescription>Subscribers and p95 latency over {windowLabel(windowFilter)}.</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  yFormatter={formatShort}
                  series={[
                    {
                      name: "Subscribers",
                      colorClassName: "stroke-fuchsia-600",
                      points: windowedHistory.subscribersCurrent
                    },
                    {
                      name: "Latency p95 (ms)",
                      colorClassName: "stroke-amber-600",
                      points: windowedHistory.latencyP95Ms
                    }
                  ]}
                />
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Total Ingested Events</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{formatNumber(summary.ingestEventsTotal)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Filtered Stream Frames</CardTitle>
                  <CardDescription>
                    {tenantFilter === "all" && modeFilter === "all" ? "all tenants/modes" : `${tenantFilter} / ${modeFilter}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{formatNumber(filteredTotals.streamFramesTotal)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Drops (Backpressure)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumber(filteredTotals.dropsBackpressureTotal)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Drops (Invalid)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">
                  {formatNumber(filteredTotals.dropsInvalidTotal)}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tenant">
            <Card>
              <CardHeader>
                <CardTitle>Per Tenant / Mode</CardTitle>
                <CardDescription>
                  Showing {filteredRows.length} rows for {tenantFilter}/{modeFilter}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2">Tenant</th>
                        <th className="px-2 py-2">Mode</th>
                        <th className="px-2 py-2">Frames Total</th>
                        <th className="px-2 py-2">Subscribers</th>
                        <th className="px-2 py-2">Drops (BP)</th>
                        <th className="px-2 py-2">Drops (Invalid)</th>
                        <th className="px-2 py-2">BP Signals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td className="px-2 py-4 text-muted-foreground" colSpan={7}>
                            No rows for current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr key={`${row.tenantId}:${row.mode}`} className="border-b border-border/60">
                            <td className="px-2 py-2 font-medium">{row.tenantId}</td>
                            <td className="px-2 py-2">{row.mode}</td>
                            <td className="px-2 py-2">{formatNumber(row.streamFramesTotal)}</td>
                            <td className="px-2 py-2">{formatNumber(row.subscribersCurrent)}</td>
                            <td className="px-2 py-2">{formatNumber(row.dropsBackpressureTotal)}</td>
                            <td className="px-2 py-2">{formatNumber(row.dropsInvalidTotal)}</td>
                            <td className="px-2 py-2">{formatNumber(row.backpressureSignalsTotal)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
