export type LngLat = [number, number];

export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type IngestEvent = {
  id: string;
  ts: string;
  loc: LngLat;
  attrs?: Record<string, unknown>;
};

export type IngestRejection = {
  index: number;
  reason: string;
};

export type IngestResponsePayload = {
  accepted: number;
  rejected: number;
  tenantId?: string;
  errors?: IngestRejection[];
  idempotencyKey?: string;
  idempotencyReplay?: boolean;
};

export type ChannelCreateRequest = {
  tenantId?: string;
  ttlSec?: number;
  res?: number;
  polygon?: [number, number][];
  tiles?: string[];
};

export type ChannelCreateResponse = {
  channelId: string;
  tenantId?: string;
  ttlSec: number;
  tilesCount: number;
  res: number;
  aoiRes?: number;
};

export type StreamTokenPayload = {
  tenantId: string;
  channelId: string;
  exp: number;
};

export type TokenMintRequest = {
  channelId: string;
  tenantId?: string;
  ttlSec?: number;
};

export type TokenMintResponse = {
  token: string;
  tokenType: "Bearer";
  ttlSec: number;
  expiresAt: string;
  channelId: string;
  tenantId: string;
};

export type StreamEventFrame = {
  type: "event";
  offset: string;
  tile: string;
  ts: string;
  id: string;
  loc: LngLat;
  op?: string;
  attrs?: Record<string, unknown>;
};

export type StreamAggregateFrame = {
  type: "aggregate";
  op?: "increment";
  offset: string;
  tile: string;
  ts: string;
  loc: LngLat;
  count: number;
  windowStart?: string;
  windowEnd?: string;
  attrs?: Record<string, unknown>;
};

export type StreamFrame = StreamEventFrame | StreamAggregateFrame;

export declare const TENANT_ID_PATTERN: string;
export declare const IDEMPOTENCY_KEY_PATTERN: string;
export declare const IDEMPOTENCY_KEY_MAX_LENGTH: number;
export declare const STREAM_OFFSET_PATTERN: string;
export declare const STREAM_OFFSET_LIVE: "$";
export declare const STREAM_OFFSET_REPLAY_START: "0-0";
export declare const STREAM_CURSOR_ID_PATTERN: string;
export declare const STREAM_FRAME_TYPE_EVENT: "event";
export declare const STREAM_FRAME_TYPE_AGGREGATE: "aggregate";

export declare function isApiErrorPayload(input: unknown): input is ApiErrorPayload;
export declare function isStreamEventFrame(input: unknown): input is StreamEventFrame;
export declare function isStreamAggregateFrame(input: unknown): input is StreamAggregateFrame;
export declare function isStreamFrame(input: unknown): input is StreamFrame;
