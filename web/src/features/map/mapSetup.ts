import maplibregl from "maplibre-gl";
import type { FeatureCollectionLike } from "../stream/types";

export const TILE_OVERLAY_LIMIT = 1200;

export function createMap(container: string) {
  return new maplibregl.Map({
    container,
    style: "https://demotiles.maplibre.org/style.json",
    center: [-73.9857, 40.7484],
    zoom: 12
  });
}

export function addBaseSourcesAndLayers(
  map: maplibregl.Map,
  tileCollection: FeatureCollectionLike,
  liveCollection: FeatureCollectionLike,
  aggregateCollection: FeatureCollectionLike
) {
  map.addSource("tiles", { type: "geojson", data: tileCollection });
  map.addLayer({
    id: "tiles-fill",
    type: "fill",
    source: "tiles",
    paint: { "fill-color": "#16a34a", "fill-opacity": 0.06 }
  });
  map.addLayer({
    id: "tiles-outline",
    type: "line",
    source: "tiles",
    paint: { "line-color": "#15803d", "line-width": 1, "line-opacity": 0.7 }
  });

  map.addSource("live", { type: "geojson", data: liveCollection });
  map.addLayer({
    id: "points",
    type: "circle",
    source: "live",
    paint: { "circle-radius": 4, "circle-opacity": 0.85 }
  });

  map.addSource("aggregates", { type: "geojson", data: aggregateCollection });
  map.addLayer({
    id: "aggregate-circles",
    type: "circle",
    source: "aggregates",
    paint: {
      "circle-color": "#ea580c",
      "circle-opacity": 0.7,
      "circle-stroke-color": "#9a3412",
      "circle-stroke-width": 1,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "count"], 1],
        1,
        8,
        20,
        14,
        100,
        20
      ]
    }
  });
  map.addLayer({
    id: "aggregate-count",
    type: "symbol",
    source: "aggregates",
    layout: {
      "text-field": ["to-string", ["coalesce", ["get", "count"], 0]],
      "text-size": 11,
      "text-allow-overlap": true
    },
    paint: {
      "text-color": "#111827"
    }
  });
}

export function setSourceData(map: maplibregl.Map | null, sourceId: string, data: FeatureCollectionLike) {
  if (!map) return;
  const source = map.getSource(sourceId) as any;
  if (source?.setData) {
    source.setData(data);
  }
}
