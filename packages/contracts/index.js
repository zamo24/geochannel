export const TENANT_ID_PATTERN = "^[A-Za-z0-9._:-]{1,80}$";
export const IDEMPOTENCY_KEY_PATTERN = "^[A-Za-z0-9._:-]+$";
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const STREAM_OFFSET_PATTERN = "^(\\$|\\d+-\\d+)$";
export const STREAM_OFFSET_LIVE = "$";
export const STREAM_OFFSET_REPLAY_START = "0-0";
export const STREAM_CURSOR_ID_PATTERN = "^[A-Za-z0-9_-]{1,100}$";
export const STREAM_FRAME_TYPE_EVENT = "event";
export const STREAM_FRAME_TYPE_AGGREGATE = "aggregate";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function isApiErrorPayload(input) {
  if (!isRecord(input)) return false;
  const error = input.error;
  if (!isRecord(error)) return false;
  return typeof error.code === "string" && typeof error.message === "string";
}

export function isStreamEventFrame(input) {
  if (!isRecord(input)) return false;
  if (input.type !== STREAM_FRAME_TYPE_EVENT) return false;
  if (typeof input.offset !== "string" || input.offset.length === 0) return false;
  if (typeof input.tile !== "string" || input.tile.length === 0) return false;
  if (typeof input.ts !== "string" || Number.isNaN(Date.parse(input.ts))) return false;
  if (typeof input.id !== "string" || input.id.length === 0) return false;
  if (!Array.isArray(input.loc) || input.loc.length !== 2) return false;
  if (!isFiniteNumber(input.loc[0]) || !isFiniteNumber(input.loc[1])) return false;
  if (input.attrs !== undefined && !isRecord(input.attrs)) return false;
  return true;
}

export function isStreamAggregateFrame(input) {
  if (!isRecord(input)) return false;
  if (input.type !== STREAM_FRAME_TYPE_AGGREGATE) return false;
  if (typeof input.offset !== "string" || input.offset.length === 0) return false;
  if (typeof input.tile !== "string" || input.tile.length === 0) return false;
  if (typeof input.ts !== "string" || Number.isNaN(Date.parse(input.ts))) return false;
  if (!Array.isArray(input.loc) || input.loc.length !== 2) return false;
  if (!isFiniteNumber(input.loc[0]) || !isFiniteNumber(input.loc[1])) return false;
  if (!Number.isInteger(input.count) || input.count <= 0) return false;
  if (input.op !== undefined && input.op !== "increment") return false;
  if (input.windowStart !== undefined && (typeof input.windowStart !== "string" || Number.isNaN(Date.parse(input.windowStart)))) return false;
  if (input.windowEnd !== undefined && (typeof input.windowEnd !== "string" || Number.isNaN(Date.parse(input.windowEnd)))) return false;
  if (input.attrs !== undefined && !isRecord(input.attrs)) return false;
  return true;
}

export function isStreamFrame(input) {
  return isStreamEventFrame(input) || isStreamAggregateFrame(input);
}
