import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import {
  isStreamAggregateFrame,
  isStreamEventFrame,
  STREAM_OFFSET_REPLAY_START
} from "@geochannel/contracts";
import {
  ChannelClientError,
  createChannel,
  mintStreamToken,
  subscribeChannelStream,
  type ChannelResponse
} from "@geochannel/client";
import { jsonHeadersWithTenantAuth, withConfiguredTenant } from "../../lib/auth";
import { setSourceData } from "../map/mapSetup";
import {
  pruneAggregateFeaturesByBoundsAndAge,
  pruneFeaturesByBoundsAndAge,
  updateLastSeen,
  upsertAggregateFeature,
  upsertFrameFeature
} from "../stream/featureStore";
import type { FeatureCollectionLike } from "../stream/types";
import {
  buildChannelKey,
  buildChannelRequestBody,
  CHANNEL_TIMEOUT_MS,
  computeTilesForViewport
} from "./channel";
const MAX_FEATURE_AGE_MS = 5 * 60 * 1000;
const RECONNECT_DELAY_MS = 1200;
const TOKEN_TIMEOUT_MS = 5000;
const STREAM_AUTH_REQUIRED = ["1", "true", "yes", "on"].includes(
  String(import.meta.env.VITE_STREAM_AUTH_REQUIRED ?? "")
    .trim()
    .toLowerCase()
);

export type ChannelStatus = "idle" | "creating" | "connecting" | "open" | "reconnecting" | "closed";

type Params = {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  apiUrl: (path: string) => string;
  streamResMin: number;
  streamResMax: number;
  maxStreamTiles: number;
  initialOffset: string;
};

function createCursorId() {
  return globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyCollection(): FeatureCollectionLike {
  return {
    type: "FeatureCollection",
    features: []
  };
}

export function useViewportChannelStream(params: Params) {
  const { mapRef, apiUrl, streamResMin, streamResMax, maxStreamTiles, initialOffset } = params;

  const [eventsSeen, setEventsSeen] = useState(0);
  const [tiles, setTiles] = useState<string[]>([]);
  const [compact, setCompact] = useState<string[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [status, setStatus] = useState<ChannelStatus>("idle");
  const [resRequested, setResRequested] = useState<number | null>(null);
  const [resUsed, setResUsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<"event" | "aggregate" | "unknown">("unknown");
  const [reconnects, setReconnects] = useState(0);

  const requestSeqRef = useRef(0);
  const statusRef = useRef<ChannelStatus>("idle");
  const lastRequestedKeyRef = useRef<string | null>(null);
  const channelAbortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const cursorIdRef = useRef(createCursorId());
  const cursorInitialOffsetRef = useRef(initialOffset);
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const optionsRef = useRef({
    streamResMin,
    streamResMax,
    maxStreamTiles,
    initialOffset
  });

  const liveCollectionRef = useRef<FeatureCollectionLike>(emptyCollection());
  const aggregateCollectionRef = useRef<FeatureCollectionLike>(emptyCollection());
  const subRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    optionsRef.current = { streamResMin, streamResMax, maxStreamTiles, initialOffset };
  }, [streamResMin, streamResMax, maxStreamTiles, initialOffset]);

  const abortPendingChannel = useCallback((reason = "replaced") => {
    if (!channelAbortRef.current) return;
    try {
      channelAbortRef.current.abort(reason);
    } catch {
      channelAbortRef.current.abort();
    }
    channelAbortRef.current = null;
  }, []);

  const pruneFeatures = useCallback((bounds: maplibregl.LngLatBounds) => {
    pruneFeaturesByBoundsAndAge(
      liveCollectionRef.current,
      bounds,
      lastSeenRef.current,
      MAX_FEATURE_AGE_MS
    );
    pruneAggregateFeaturesByBoundsAndAge(
      aggregateCollectionRef.current,
      bounds,
      MAX_FEATURE_AGE_MS
    );
    setSourceData(mapRef.current, "live", liveCollectionRef.current);
    setSourceData(mapRef.current, "aggregates", aggregateCollectionRef.current);
  }, [mapRef]);

  const refreshFromViewport = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const opts = optionsRef.current;
    if (cursorInitialOffsetRef.current !== opts.initialOffset) {
      cursorInitialOffsetRef.current = opts.initialOffset;
      cursorIdRef.current = createCursorId();
    }
    const computed = computeTilesForViewport(
      bounds,
      map.getZoom(),
      opts.streamResMin,
      opts.streamResMax,
      opts.maxStreamTiles
    );

    setResRequested(computed.baseRes);
    setResUsed(computed.res);
    setTiles(computed.tiles);
    setCompact(computed.compacted);
    setError(null);

    const channelKey = `${buildChannelKey(computed.res, computed.tiles)}:${opts.initialOffset}`;
    if (
      channelKey === lastRequestedKeyRef.current &&
      statusRef.current !== "reconnecting" &&
      statusRef.current !== "closed"
    ) {
      return;
    }

    lastRequestedKeyRef.current = channelKey;
    const seq = ++requestSeqRef.current;
    setStatus("creating");
    setEventsSeen(0);
    setStreamMode("unknown");
    lastSeenRef.current.clear();
    liveCollectionRef.current.features = [];
    aggregateCollectionRef.current.features = [];
    setSourceData(mapRef.current, "live", liveCollectionRef.current);
    setSourceData(mapRef.current, "aggregates", aggregateCollectionRef.current);

    abortPendingChannel("replaced");

    const body = withConfiguredTenant(buildChannelRequestBody(bounds, computed.compacted, computed.res));
    const controller = new AbortController();
    channelAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort("timeout"), CHANNEL_TIMEOUT_MS);

    const scheduleReconnect = (message: string) => {
      if (reconnectTimerRef.current !== null) return;
      subRef.current?.close();
      subRef.current = null;
      setStatus("reconnecting");
      setReconnects((count) => count + 1);
      setError(message);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        void refreshFromViewport();
      }, RECONNECT_DELAY_MS);
    };

    let channel: ChannelResponse | null = null;
    try {
      channel = await createChannel({
        apiUrl,
        body,
        headers: jsonHeadersWithTenantAuth(),
        signal: controller.signal
      });
      window.clearTimeout(timeout);
    } catch (err) {
      window.clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        const reason = controller.signal.reason;
        if (reason === "replaced" || reason === "cleanup") return;
        if (reason === "timeout") {
          scheduleReconnect("Channel request timed out.");
          return;
        }
        scheduleReconnect("Channel request aborted.");
        return;
      }
      if (err instanceof ChannelClientError) {
        if (err.status) {
          console.warn("[channels] error", err.status, err.responseText);
          scheduleReconnect(err.code ? `Channel error: ${err.code}.` : `Channel error (${err.status}).`);
        } else {
          scheduleReconnect(err.message);
        }
        return;
      }
      scheduleReconnect("Channel request failed.");
      return;
    } finally {
      window.clearTimeout(timeout);
      if (channelAbortRef.current === controller) {
        channelAbortRef.current = null;
      }
    }

    if (seq !== requestSeqRef.current || !channel?.channelId) return;

    setChannelId(channel.channelId);
    pruneFeatures(bounds);

    let streamHeaders: Record<string, string> | undefined = undefined;
    if (STREAM_AUTH_REQUIRED) {
      const tokenController = new AbortController();
      const tokenTimeout = window.setTimeout(() => tokenController.abort("timeout"), TOKEN_TIMEOUT_MS);
      try {
        const token = await mintStreamToken({
          apiUrl,
          headers: jsonHeadersWithTenantAuth(),
          body: withConfiguredTenant({
            channelId: channel.channelId,
            tenantId: channel.tenantId
          }),
          signal: tokenController.signal
        });

        streamHeaders = {
          authorization: `Bearer ${token}`
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          const reason = tokenController.signal.reason;
          if (reason === "timeout") {
            scheduleReconnect("Token request timed out.");
            return;
          }
          scheduleReconnect("Token request aborted.");
          return;
        }
        if (err instanceof ChannelClientError) {
          if (err.status) {
            console.warn("[token] error", err.status, err.responseText);
            scheduleReconnect(err.code ? `Token error: ${err.code}.` : `Token error (${err.status}).`);
          } else {
            scheduleReconnect(err.message);
          }
          return;
        }
        scheduleReconnect("Token request failed.");
        return;
      } finally {
        window.clearTimeout(tokenTimeout);
      }
    }
    if (seq !== requestSeqRef.current) return;

    subRef.current?.close();
    setStatus("connecting");

    const handle = subscribeChannelStream(apiUrl, {
      channelId: channel.channelId,
      offset: opts.initialOffset ?? STREAM_OFFSET_REPLAY_START,
      cursorId: cursorIdRef.current,
      headers: streamHeaders,
      onOpen: () => {
        setStatus("open");
      },
      onReady: (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const mode = (payload as { mode?: unknown }).mode;
        if (mode === "event" || mode === "aggregate") {
          setStreamMode(mode);
        }
      },
      onError: (err: unknown) => {
        scheduleReconnect(
          err instanceof ChannelClientError && err.code ? `Stream error: ${err.code}.` : "Stream connection error."
        );
      },
      onMessage: (frame: unknown) => {
        if (isStreamEventFrame(frame)) {
          if (!frame.id) return;
          if (!updateLastSeen(lastSeenRef.current, frame)) return;
          upsertFrameFeature(liveCollectionRef.current, frame);
          setSourceData(mapRef.current, "live", liveCollectionRef.current);
          setStreamMode("event");
          setEventsSeen((count) => count + 1);
          return;
        }
        if (isStreamAggregateFrame(frame)) {
          upsertAggregateFeature(aggregateCollectionRef.current, frame);
          setSourceData(mapRef.current, "aggregates", aggregateCollectionRef.current);
          setStreamMode("aggregate");
          setEventsSeen((count) => count + frame.count);
        }
      }
    });
    subRef.current = handle;
  }, [abortPendingChannel, apiUrl, mapRef, pruneFeatures]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      abortPendingChannel("cleanup");
      subRef.current?.close();
      subRef.current = null;
    };
  }, [abortPendingChannel]);

  return {
    channelId,
    compact,
    error,
    eventsSeen,
    aggregateCollectionRef,
    liveCollectionRef,
    refreshFromViewport,
    reconnects,
    resRequested,
    resUsed,
    streamMode,
    status,
    tiles
  };
}
