import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { jsonHeadersWithIngestAuth } from "../../lib/auth";
import { buildDemoBatch, DEMO_GEN_ASSETS, DEMO_GEN_RATE_MS, ensureDemoAssets } from "./demoGenerator";

type Params = {
  enabled: boolean;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  apiUrl: (path: string) => string;
};

export function useDemoGenerator(params: Params) {
  const { enabled, mapRef, apiUrl } = params;
  const [error, setError] = useState<string | null>(null);

  const assetsRef = useRef<string[]>([]);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    assetsRef.current = ensureDemoAssets(assetsRef.current, DEMO_GEN_ASSETS);

    const timer = window.setInterval(async () => {
      if (inFlightRef.current) return;
      const map = mapRef.current;
      if (!map) return;

      const batch = buildDemoBatch(map.getBounds(), assetsRef.current);
      inFlightRef.current = true;
      try {
        const res = await fetch(apiUrl("/ingest/events"), {
          method: "POST",
          headers: jsonHeadersWithIngestAuth(),
          body: JSON.stringify(batch)
        });
        if (!res.ok) {
          const text = await res.text();
          setError(`Generator error (${res.status}).`);
          console.warn("[demo-gen] error", res.status, text);
        } else {
          setError(null);
        }
      } catch (err) {
        setError("Generator request failed.");
        console.warn("[demo-gen] error", err);
      } finally {
        inFlightRef.current = false;
      }
    }, DEMO_GEN_RATE_MS);

    return () => window.clearInterval(timer);
  }, [apiUrl, enabled, mapRef]);

  return { error };
}
