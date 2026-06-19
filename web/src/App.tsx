import { lazy, Suspense, useCallback, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";

type AppView = "map" | "metrics";

const API_BASE = import.meta.env.VITE_API_URL?.trim();
const MapPage = lazy(() => import("./features/map/MapPage").then((module) => ({ default: module.MapPage })));
const MetricsDashboard = lazy(() =>
  import("./features/metrics/MetricsDashboard").then((module) => ({ default: module.MetricsDashboard }))
);

export default function App() {
  const [view, setView] = useState<AppView>("map");

  const apiUrl = useCallback((path: string) => {
    if (API_BASE) {
      return new URL(path, API_BASE).toString();
    }
    return new URL(path, window.location.origin).toString();
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">GeoChannel Demo</h1>
            <p className="text-xs text-muted-foreground">Live map streaming + operational metrics dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">API {API_BASE ?? "same-origin"}</Badge>
            <Tabs value={view} onValueChange={(next) => setView(next as AppView)}>
              <TabsList>
                <TabsTrigger value="map">Live Map</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading view...</div>}>
          {view === "map" ? <MapPage apiUrl={apiUrl} apiBase={API_BASE} /> : <MetricsDashboard apiUrl={apiUrl} />}
        </Suspense>
      </main>
    </div>
  );
}
