import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useViewportChannelStream } from "../channels/useViewportChannelStream";
import { DEFAULT_MAX_STREAM_TILES, DEFAULT_STREAM_RES_MAX, DEFAULT_STREAM_RES_MIN } from "../channels/channel";
import { useDemoGenerator } from "../demo-generator/useDemoGenerator";
import { addBaseSourcesAndLayers, createMap, setSourceData, TILE_OVERLAY_LIMIT } from "./mapSetup";
import { tilesToFeatureCollection } from "../../lib/h3";
import { useDebouncedCallback } from "../../lib/util";
import { Hud } from "../ui/Hud";
import type { FeatureCollectionLike } from "../stream/types";
import { STREAM_OFFSET_LIVE, STREAM_OFFSET_REPLAY_START } from "@geochannel/contracts";

type MapPageProps = {
  apiUrl: (path: string) => string;
  apiBase?: string;
};

export function MapPage({ apiUrl, apiBase }: MapPageProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [showTiles, setShowTiles] = useState(true);
  const [tileOverlayError, setTileOverlayError] = useState<string | null>(null);
  const [streamResMin, setStreamResMin] = useState<number>(DEFAULT_STREAM_RES_MIN);
  const [streamResMax, setStreamResMax] = useState<number>(DEFAULT_STREAM_RES_MAX);
  const [maxStreamTiles, setMaxStreamTiles] = useState<number>(DEFAULT_MAX_STREAM_TILES);
  const [demoGenEnabled, setDemoGenEnabled] = useState(false);
  const [replayOffset, setReplayOffset] = useState<string>(STREAM_OFFSET_REPLAY_START);
  const tileFcRef = useRef<FeatureCollectionLike>({
    type: "FeatureCollection",
    features: []
  });

  const {
    aggregateCollectionRef,
    channelId,
    compact,
    error,
    eventsSeen,
    liveCollectionRef,
    refreshFromViewport,
    reconnects,
    resRequested,
    resUsed,
    streamMode,
    status,
    tiles
  } = useViewportChannelStream({
    apiUrl,
    mapRef,
    maxStreamTiles,
    initialOffset: replayOffset,
    streamResMax,
    streamResMin
  });

  const { error: demoGenError } = useDemoGenerator({
    apiUrl,
    enabled: demoGenEnabled,
    mapRef
  });

  useEffect(() => {
    const map = createMap("map");
    mapRef.current = map;

    map.on("load", () => {
      addBaseSourcesAndLayers(map, tileFcRef.current, liveCollectionRef.current, aggregateCollectionRef.current);
      void refreshFromViewport();
    });

    const onMoveEnd = useDebouncedCallback(() => {
      void refreshFromViewport();
    }, 200);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("moveend", onMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [aggregateCollectionRef, liveCollectionRef, refreshFromViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    void refreshFromViewport();
  }, [maxStreamTiles, refreshFromViewport, replayOffset, streamResMax, streamResMin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showTiles) {
      tileFcRef.current.features = [];
      setSourceData(map, "tiles", tileFcRef.current);
      setTileOverlayError(null);
      return;
    }

    if (tiles.length > TILE_OVERLAY_LIMIT) {
      tileFcRef.current.features = [];
      setSourceData(map, "tiles", tileFcRef.current);
      setTileOverlayError(`Stream tile overlay skipped (${tiles.length} tiles).`);
      return;
    }

    tileFcRef.current = tilesToFeatureCollection(tiles) as FeatureCollectionLike;
    setSourceData(map, "tiles", tileFcRef.current);
    setTileOverlayError(null);
  }, [tiles, showTiles]);

  return (
    <div className="relative h-full w-full">
      <div id="map" className="map" />
      <Hud
        status={status}
        channelId={channelId}
        resRequested={resRequested}
        resUsed={resUsed}
        tilesCount={tiles.length}
        compactCount={compact.length}
        eventsSeen={eventsSeen}
        streamMode={streamMode}
        reconnects={reconnects}
        replayOffset={replayOffset}
        setReplayOffset={setReplayOffset}
        demoGenEnabled={demoGenEnabled}
        setDemoGenEnabled={setDemoGenEnabled}
        demoGenError={demoGenError}
        streamResMin={streamResMin}
        streamResMax={streamResMax}
        setStreamResMin={setStreamResMin}
        setStreamResMax={setStreamResMax}
        maxStreamTiles={maxStreamTiles}
        setMaxStreamTiles={setMaxStreamTiles}
        showTiles={showTiles}
        setShowTiles={setShowTiles}
        tileOverlayError={tileOverlayError}
        error={error}
        apiBase={apiBase}
      />
    </div>
  );
}
