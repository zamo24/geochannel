import React from "react";

type Status = "idle" | "creating" | "connecting" | "open" | "reconnecting" | "closed";

type Props = {
  status: Status;
  channelId: string | null;
  resRequested: number | null;
  resUsed: number | null;
  tilesCount: number;
  compactCount: number;
  eventsSeen: number;
  streamMode: "event" | "aggregate" | "unknown";
  reconnects: number;
  replayOffset: string;
  setReplayOffset: (value: string) => void;
  demoGenEnabled: boolean;
  setDemoGenEnabled: (v: boolean) => void;
  demoGenError: string | null;
  streamResMin: number;
  streamResMax: number;
  setStreamResMin: (v: number) => void;
  setStreamResMax: (v: number) => void;
  maxStreamTiles: number;
  setMaxStreamTiles: (v: number) => void;
  showTiles: boolean;
  setShowTiles: (v: boolean) => void;
  tileOverlayError: string | null;
  error: string | null;
  apiBase?: string;
};

export function Hud(props: Props) {
  return (
    <div className="hud">
      <div className="row"><b>Status:</b> {props.status}</div>
      <div className="row"><b>Channel:</b> {props.channelId ?? "-"}</div>
      <div className="row">
        <b>Res:</b>{" "}
        {props.resRequested === null ? "-" : props.resRequested}
        {props.resUsed !== null && props.resRequested !== null && props.resUsed !== props.resRequested
          ? ` → ${props.resUsed}`
          : ""}
      </div>
      <div className="row"><b>Stream tiles:</b> {props.tilesCount}</div>
      <div className="row"><b>Compacted tiles:</b> {props.compactCount}</div>
      <div className="row"><b>Frame mode:</b> {props.streamMode}</div>
      <div className="row"><b>Events seen:</b> {props.eventsSeen}</div>
      <div className="row"><b>Reconnects:</b> {props.reconnects}</div>

      <div className="row">
        <b>Replay:</b>{" "}
        <select value={props.replayOffset} onChange={(event) => props.setReplayOffset(event.target.value)}>
          <option value="0-0">Retained history</option>
          <option value="$">Live only</option>
        </select>
      </div>

      <div className="row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={props.demoGenEnabled}
            onChange={(e) => props.setDemoGenEnabled(e.target.checked)}
          />
          <span>Generate in viewport</span>
        </label>
      </div>
      {props.demoGenError ? <div className="row small">{props.demoGenError}</div> : null}

      <div className="row">
        <b>Stream res range:</b>{" "}
        <input
          className="num-input"
          type="number"
          min={0}
          max={15}
          value={Number.isFinite(props.streamResMin) ? props.streamResMin : ""}
          onChange={(e) => props.setStreamResMin(Number.parseInt(e.target.value, 10))}
        />
        {" - "}
        <input
          className="num-input"
          type="number"
          min={0}
          max={15}
          value={Number.isFinite(props.streamResMax) ? props.streamResMax : ""}
          onChange={(e) => props.setStreamResMax(Number.parseInt(e.target.value, 10))}
        />
      </div>

      <div className="row">
        <b>Max tiles:</b>{" "}
        <input
          className="num-input wide"
          type="number"
          min={0}
          value={Number.isFinite(props.maxStreamTiles) ? props.maxStreamTiles : ""}
          onChange={(e) => props.setMaxStreamTiles(Number.parseInt(e.target.value, 10))}
        />
        <span className="hint">0 = unlimited</span>
      </div>

      <div className="row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={props.showTiles}
            onChange={(e) => props.setShowTiles(e.target.checked)}
          />
          <span>Show H3 tiles</span>
        </label>
      </div>

      {props.tileOverlayError ? <div className="row small">{props.tileOverlayError}</div> : null}
      <div className="row small">{props.error ?? " "}</div>
      <div className="row small">API: <span className="code">{props.apiBase}</span></div>
    </div>
  );
}
