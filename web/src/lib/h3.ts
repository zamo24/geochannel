import * as h3 from "h3-js";
import type { LngLatBoundsLike } from "maplibre-gl";

function boundsToRing(bounds: LngLatBoundsLike): [number, number][] {
  const b = bounds as any;
  const sw = b.getSouthWest ? b.getSouthWest() : { lng: b[0], lat: b[1] };
  const ne = b.getNorthEast ? b.getNorthEast() : { lng: b[2], lat: b[3] };
  const nw = { lng: sw.lng, lat: ne.lat };
  const se = { lng: ne.lng, lat: sw.lat };

  // [lng,lat] → [lat,lng]
  return [
    [sw.lat, sw.lng],
    [se.lat, se.lng],
    [ne.lat, ne.lng],
    [nw.lat, nw.lng],
    [sw.lat, sw.lng]
  ];
}

export function uniqueTilesFromBounds(bounds: LngLatBoundsLike, res: number): string[] {
  const ringLatLng = boundsToRing(bounds);
  return Array.from(new Set(h3.polygonToCells([ringLatLng], res)));
}

export function compactTiles(tiles: string[]): string[] {
  if (tiles.length === 0) return [];
  return h3.compactCells(tiles);
}

export function boundsToPolygon(bounds: LngLatBoundsLike): [number, number][] {
  return boundsToRing(bounds);
}

export function tilesToFeatureCollection(tiles: string[]) {
  const features = tiles.map((tile) => {
    const boundary = h3.cellToBoundary(tile, true) as [number, number][];
    if (boundary.length > 0) {
      const [firstLng, firstLat] = boundary[0];
      const [lastLng, lastLat] = boundary[boundary.length - 1];
      if (firstLng !== lastLng || firstLat !== lastLat) {
        boundary.push([firstLng, firstLat]);
      }
    }
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [boundary]
      },
      properties: { tile }
    };
  });

  return {
    type: "FeatureCollection",
    features
  };
}
